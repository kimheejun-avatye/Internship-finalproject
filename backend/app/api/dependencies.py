import logging

from fastapi import Depends, Request
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.exceptions import ApiError
from app.db.session import get_db
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
        # Confirm handler writes before the optional session activity update.
        db.commit()
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
                db.commit()
            except ApiError:
                db.rollback()
            except SQLAlchemyError:
                db.rollback()
                logging.getLogger(__name__).warning(
                    "Optional session activity update failed", exc_info=True
                )


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
