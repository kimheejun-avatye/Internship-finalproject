import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import select, update

from app.core.config import settings
from app.core.exceptions import ApiError
from app.core.security import same
from app.models.user_sessions import UserSession
from app.models.users import User
from app.services import clock


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def allowed(user):
    if user.blocked_at is not None:
        raise ApiError(403, "USER_BLOCKED", "차단된 계정입니다.")
    if user.approved_at is None:
        raise ApiError(403, "USER_PENDING", "관리자 승인 후 로그인할 수 있습니다.")


def create(db, user):
    now = clock.now()
    token = secrets.token_urlsafe(32)
    session = UserSession(
        token_hash=token_hash(token),
        user_id=user.user_id,
        csrf_token=secrets.token_urlsafe(32),
        created_at=now,
        last_activity_at=now,
        idle_expires_at=now + timedelta(seconds=settings.session_idle_seconds),
        absolute_expires_at=now + timedelta(seconds=settings.session_absolute_seconds),
    )
    db.add(session)
    db.flush()
    return token, session


def current(db, token):
    if not token or len(token) > 256:
        raise ApiError(401, "SESSION_REQUIRED", "로그인이 필요합니다.")
    found = db.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash(token))
    )
    if not found:
        raise ApiError(401, "SESSION_REQUIRED", "로그인이 필요합니다.")
    # All session mutations lock the member before the session. Password changes use this order too.
    user = db.scalar(
        select(User)
        .where(User.user_id == found.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    session = db.scalar(
        select(UserSession)
        .where(UserSession.session_id == found.session_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not user or session.revoked_at:
        raise ApiError(401, "SESSION_REVOKED", "로그인이 종료되었습니다.")
    now = clock.now()
    if session.idle_expires_at <= now or session.absolute_expires_at <= now:
        raise ApiError(401, "SESSION_EXPIRED", "로그인 시간이 만료되었습니다.")
    allowed(user)
    return user, session


def check_csrf(session, value):
    if not value or not same(session.csrf_token, value):
        raise ApiError(
            403, "CSRF_FAILED", "보안 확인에 실패했습니다. 새로고침해주세요."
        )


def touch(session):
    now = clock.now()
    if (
        session.revoked_at
        or session.idle_expires_at <= now
        or session.absolute_expires_at <= now
    ):
        raise ApiError(401, "SESSION_EXPIRED", "로그인 시간이 만료되었습니다.")
    session.last_activity_at = now
    session.idle_expires_at = min(
        now + timedelta(seconds=settings.session_idle_seconds),
        session.absolute_expires_at,
    )


def revoke_all(db, user_id):
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=clock.now())
    )


def user_data(user):
    return {
        "user_id": str(user.user_id),
        "email": user.email,
        "name": user.name,
        "position": user.position,
        "team": user.team.value,
        "role": user.role.value,
    }


def payload(user, session):
    return {
        "user": user_data(user),
        "csrf_token": session.csrf_token,
        "idle_expires_at": session.idle_expires_at,
        "absolute_expires_at": session.absolute_expires_at,
    }
