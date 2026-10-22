# 회원가입: 이메일 확인 → 인증번호 발송·검증 → 가입 요청(승인 대기)

import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.exceptions import ApiError
from app.models.email_send_log import EmailSendLog
from app.models.email_verifications import EmailVerification
from app.models.signup_check_log import SignupCheckLog
from app.models.users import User
from app.schemas.auth import SignupIn

HOUR = timedelta(hours=1)
MINUTE = timedelta(minutes=1)
DAY = timedelta(days=1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def require_company_ip(ip: str) -> None:
    if not settings.is_company_ip(ip):
        raise ApiError(403, "NOT_COMPANY_NETWORK", "회사 네트워크에서만 가입할 수 있습니다.")


def _lock(db: Session, key: str) -> None:
    """같은 키의 요청을 트랜잭션이 끝날 때까지 한 줄로 세운다."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": key})


def _seconds_until(moment: datetime, now: datetime) -> int:
    return max(1, math.ceil((moment - now).total_seconds()))


def _window(db: Session, column, filters: list, window: timedelta, now: datetime):
    """기간 안의 (건수, 가장 오래된 시각)"""
    return db.execute(
        select(func.count(), func.min(column)).where(column > now - window, *filters)
    ).one()


def _active_user(db: Session, email: str) -> Optional[User]:
    return db.scalars(select(User).where(User.email == email, User.blocked_at.is_(None))).first()


def check_email(db: Session, ip: str, email: str) -> str:
    require_company_ip(ip)
    now = _now()
    _lock(db, "check:" + ip)
    count, oldest = _window(db, SignupCheckLog.checked_at, [SignupCheckLog.ip == ip], HOUR, now)
    if count >= settings.ip_hourly_check_limit:
        raise ApiError(429, "RATE_LIMIT_IP", "요청이 너무 많습니다.", _seconds_until(oldest + HOUR, now))
    db.add(SignupCheckLog(ip=ip))
    user = _active_user(db, email)
    db.commit()
    if user is None:
        return "AVAILABLE"
    return "PENDING" if user.approved_at is None else "REGISTERED"


def send_code(db: Session, ip: str, email: str):
    """인증번호를 발급하고 (log_id, code) 를 돌려준다. 실제 메일 발송은 호출한 쪽이 백그라운드로 한다."""
    require_company_ip(ip)
    now = _now()
    _lock(db, "email:" + email)
    _lock(db, "send:global")  # IP·서비스 전체 한도 계산이 겹쳐서 초과되지 않게 한다

    if _active_user(db, email) is not None:
        raise ApiError(409, "EMAIL_TAKEN", "이미 가입했거나 승인 대기 중인 이메일입니다.")

    row = db.get(EmailVerification, email)
    if row is not None and row.locked_until is not None and row.locked_until > now:
        raise ApiError(429, "CODE_LOCKED", "시도 횟수를 초과했습니다.", _seconds_until(row.locked_until, now))

    last_sent = db.scalar(select(func.max(EmailSendLog.sent_at)).where(EmailSendLog.email == email))
    if last_sent is not None:
        cooldown_end = last_sent + timedelta(seconds=settings.resend_cooldown_seconds)
        if cooldown_end > now:
            raise ApiError(429, "RESEND_COOLDOWN", "잠시 후 다시 요청해 주세요.", _seconds_until(cooldown_end, now))

    # 서버 쪽 발송 실패는 이메일별 횟수에서 제외한다. IP·서비스 한도에는 모두 센다
    count, oldest = _window(
        db, EmailSendLog.sent_at, [EmailSendLog.email == email, EmailSendLog.failed.is_(False)], HOUR, now
    )
    if count >= settings.email_hourly_limit:
        raise ApiError(429, "RATE_LIMIT_EMAIL", "요청이 너무 많습니다.", _seconds_until(oldest + HOUR, now))

    for limit, window in (
        (settings.ip_hourly_send_limit, HOUR),
        (settings.ip_minute_send_limit, MINUTE),
    ):
        count, oldest = _window(db, EmailSendLog.sent_at, [EmailSendLog.ip == ip], window, now)
        if count >= limit:
            raise ApiError(429, "RATE_LIMIT_IP", "요청이 너무 많습니다.", _seconds_until(oldest + window, now))

    count, oldest = _window(db, EmailSendLog.sent_at, [], DAY, now)
    if count >= settings.service_daily_send_limit:
        raise ApiError(
            429, "SERVICE_LIMIT", "현재 인증 메일을 보낼 수 없습니다.", _seconds_until(oldest + DAY, now)
        )

    code = security.new_code()
    log = EmailSendLog(email=email, ip=ip, sent_at=now)
    db.add(log)
    if row is None:
        row = EmailVerification(email=email, failed_count=0)
        db.add(row)
    # 새 코드를 발급하면 이전 코드와 가입 토큰은 무효. 실패 횟수는 유지한다
    row.code_hash = security.digest("code", email, code)
    row.code_expires_at = now + timedelta(seconds=settings.code_ttl_seconds)
    row.last_sent_at = now
    row.signup_token_hash = None
    row.signup_token_expires_at = None
    db.commit()
    return log.log_id, code


def verify_code(db: Session, ip: str, email: str, code: str) -> str:
    require_company_ip(ip)
    now = _now()
    _lock(db, "email:" + email)
    row = db.get(EmailVerification, email)

    if row is not None and row.locked_until is not None and row.locked_until > now:
        raise ApiError(429, "CODE_LOCKED", "시도 횟수를 초과했습니다.", _seconds_until(row.locked_until, now))
    if row is None or row.code_hash is None or row.code_expires_at is None or row.code_expires_at <= now:
        raise ApiError(400, "CODE_EXPIRED", "코드가 만료되었습니다. 재전송해 주세요.")

    if not security.same(row.code_hash, security.digest("code", email, code)):
        row.failed_count += 1
        if row.failed_count >= settings.max_failed_attempts:
            # 잠금과 함께 코드를 폐기한다. 잠금이 풀리면 새 코드로 다시 5회를 쓴다
            row.locked_until = now + timedelta(seconds=settings.lock_seconds)
            row.code_hash = None
            row.failed_count = 0
            db.commit()
            raise ApiError(429, "CODE_LOCKED", "시도 횟수를 초과했습니다.", settings.lock_seconds)
        remaining = settings.max_failed_attempts - row.failed_count
        db.commit()
        raise ApiError(400, "CODE_MISMATCH", "인증번호가 올바르지 않습니다.", remaining_attempts=remaining)

    token = security.new_signup_token()
    row.code_hash = None  # 일회용
    row.failed_count = 0
    row.signup_token_hash = security.digest("token", email, token)
    row.signup_token_expires_at = now + timedelta(seconds=settings.signup_token_ttl_seconds)
    db.commit()
    return token


def signup(db: Session, ip: str, data: SignupIn) -> User:
    require_company_ip(ip)
    now = _now()
    password_hash = security.hash_password(data.password)  # 무거운 계산은 잠금 밖에서
    _lock(db, "email:" + data.email)
    row = db.get(EmailVerification, data.email)
    if (
        row is None
        or row.signup_token_hash is None
        or row.signup_token_expires_at is None
        or row.signup_token_expires_at <= now
        or not security.same(row.signup_token_hash, security.digest("token", data.email, data.signup_token))
    ):
        raise ApiError(400, "INVALID_TOKEN", "이메일 인증이 필요합니다. 인증번호부터 다시 받아 주세요.")

    user = User(
        email=data.email,
        name=data.name,
        birth_date=data.birth_date,
        phone=data.phone,
        password_hash=password_hash,
        team=data.team,
        # 가입 요청에서 검증한 부서/직무를 기존 사용자 정보와 같은 트랜잭션으로 저장한다.
        position=data.position,
    )
    db.add(user)
    row.signup_token_hash = None  # 일회용
    row.signup_token_expires_at = None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "EMAIL_TAKEN", "이미 가입된 이메일입니다.")
    return user
