from typing import Optional
from uuid import UUID

from fastapi import Depends, Request

from app.core.config import settings
from app.core.exceptions import ApiError
from app.db.session import SessionLocal, get_db
from app.services import sessions


def client_ip(request):
    return request.client.host if request.client else "unknown"


def authenticated(request: Request, db=Depends(get_db)):
    token = request.cookies.get(settings.cookie_name, "")
    user, session = sessions.current(db, token)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        sessions.check_csrf(session, request.headers.get("X-CSRF-Token", ""))
    try:
        yield user, session
    except Exception:
        db.rollback()
        raise
    else:
        # Run before sending the response, while authentication's DB dependency is alive.
        # Recheck after a service commit so a concurrent logout cannot be resurrected.
        if request.headers.get(
            "x-session-activity"
        ) == "user" and request.url.path not in {
            "/api/auth/me",
            "/api/auth/activity",
            "/api/auth/password/change",
        }:
            try:
                _, fresh = sessions.current(db, token)
                sessions.touch(fresh)
            except ApiError:
                db.rollback()
        db.commit()


def set_cookie(response, token):
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_absolute_seconds,
        path="/",
        httponly=True,
        secure=settings.production,
        samesite="lax",
    )


def delete_cookie(response):
    response.delete_cookie(
        settings.cookie_name,
        path="/",
        httponly=True,
        secure=settings.production,
        samesite="lax",
    )


def password_authenticated(request: Request, db=Depends(get_db)):
    from app.services.login_limits import ip_limit

    ip_limit(db, client_ip(request), "password-change")
    yield from authenticated(request, db)


def websocket_user_id(token: str) -> Optional[UUID]:
    """WebSocket 연결과 ping 때 세션을 확인한다. run_in_threadpool 로 호출한다.

    sessions.current 가 FOR UPDATE 로 잠그므로 새 DB 세션을 열고 확인 즉시 commit 하고 닫는다.
    소켓이 로그인을 연장하면 안 되므로 sessions.touch 는 부르지 않는다.
    로그인이 아니거나 만료·차단이면 None.
    """
    try:
        with SessionLocal() as db:
            user, _ = sessions.current(db, token)
            db.commit()
            return user.user_id
    except ApiError:
        return None
