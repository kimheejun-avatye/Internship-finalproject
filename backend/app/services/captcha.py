"""인증 결과만 서버 간 확인한다. 예약 및 사용 기록은 고객사 트랜잭션이 소유한다."""
from datetime import timedelta, timezone
from uuid import UUID, uuid4

import httpx
from pydantic import AwareDatetime, BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ApiError
from app.models.captcha_intents import CaptchaIntent
from app.models.reservations import Reservation
from app.schemas.reservations import (
    ReservationCreateIn,
    ReservationCreateOut,
    ReservationSubmitIn,
)
from app.services import clock
from app.services.reservations import ReservationService


class IssuedChallenge(BaseModel):
    challengeId: str = Field(min_length=1)
    creative: dict
    expiresAt: AwareDatetime


def provider_request(path: str, body: dict) -> dict:
    if len(settings.captchavatye_service_key) < 32:
        raise ApiError(503, "CAPTCHA_UNAVAILABLE", "인증 서비스 설정을 확인해 주세요.")
    base = settings.captchavatye_api_url.rstrip("/")
    if not base.startswith(("http://", "https://")) or settings.production and not base.startswith("https://"):
        raise ApiError(503, "CAPTCHA_UNAVAILABLE", "인증 서비스 주소를 확인해 주세요.")
    try:
        with httpx.Client(timeout=3.0, follow_redirects=False, trust_env=False) as client:
            response = client.post(base + path, json=body,
                headers={"Authorization": "Bearer " + settings.captchavatye_service_key})
        if response.status_code == 403:
            raise ApiError(403, "CAPTCHA_INVALID", "인증이 유효하지 않습니다. 다시 인증해 주세요.")
        response.raise_for_status()
        value = response.json()
        if not isinstance(value, dict):
            raise ValueError("Invalid provider response")
        return value
    except (httpx.HTTPError, ValueError) as error:
        raise ApiError(503, "CAPTCHA_UNAVAILABLE", "인증 서버에 연결하지 못했습니다. 다시 시도해 주세요.") from error


def reservation_payload(data: ReservationCreateIn) -> dict:
    payload = data.model_dump(mode="json", exclude={"captcha"})
    for name in ("start_at", "end_at"):
        payload[name] = getattr(data, name).astimezone(timezone.utc).isoformat()
    return payload


def prepare_captcha(db: Session, user_id: UUID, data: ReservationCreateIn) -> dict:
    intent_id = uuid4()
    raw = provider_request("/internal/challenges", {"creativeId": "bmw-m3-v1", "subject": str(intent_id)})
    try:
        issued = IssuedChallenge.model_validate(raw)
        if issued.creative.get("creativeId") != "bmw-m3-v1" or issued.expiresAt <= clock.now():
            raise ValueError("Invalid provider challenge")
    except (ValidationError, ValueError) as error:
        raise ApiError(503, "CAPTCHA_UNAVAILABLE", "인증 서버 응답을 확인하지 못했습니다.") from error
    expires_at = min(issued.expiresAt, clock.now() + timedelta(minutes=10))
    intent = CaptchaIntent(intent_id=intent_id, user_id=user_id,
        challenge_id=issued.challengeId, payload=reservation_payload(data), expires_at=expires_at)
    db.add(intent)
    db.commit()
    return {"intent_id": intent_id, "challenge": {"challengeId": issued.challengeId, "creative": issued.creative},
            "expires_at": expires_at}


def reserve_with_captcha(db: Session, user_id: UUID, data: ReservationSubmitIn) -> ReservationCreateOut:
    proof = data.captcha
    if proof is None:
        raise ApiError(403, "CAPTCHA_REQUIRED", "예약하려면 인증을 완료해 주세요.")
    try:
        intent = db.scalar(select(CaptchaIntent).where(CaptchaIntent.intent_id == proof.intent_id)
            .with_for_update().execution_options(populate_existing=True))
        if (intent is None or intent.user_id != user_id or intent.challenge_id != proof.challenge_id
                or intent.payload != reservation_payload(data)):
            raise ApiError(403, "CAPTCHA_INVALID", "예약 정보에 맞는 인증을 다시 진행해 주세요.")
        # 저장 후 응답만 잃은 요청은 만료 이후에도 같은 예약을 반환한다.
        if intent.reservation_id is not None:
            if intent.completion_id != proof.completion_id:
                raise ApiError(403, "CAPTCHA_INVALID", "이미 사용된 인증 결과와 다릅니다.")
            result = ReservationCreateOut.model_validate(db.get(Reservation, intent.reservation_id))
            db.commit()
            return result
        if intent.expires_at <= clock.now():
            raise ApiError(403, "CAPTCHA_EXPIRED", "인증 시간이 만료되었습니다. 다시 인증해 주세요.")
        raw = provider_request("/internal/completions/verify", {
            "challengeId": proof.challenge_id, "completionId": proof.completion_id, "subject": str(intent.intent_id),
        })
        if (raw.get("passed") is not True or raw.get("challengeId") != intent.challenge_id
                or raw.get("completionId") != proof.completion_id or raw.get("subject") != str(intent.intent_id)):
            raise ApiError(403, "CAPTCHA_INVALID", "서버에서 인증 완료를 확인하지 못했습니다.")
        return ReservationService(db).create_reservation(user_id, data, captcha_intent=intent,
                                                        completion_id=proof.completion_id)
    except IntegrityError as error:
        db.rollback()
        if getattr(error.orig.diag, "constraint_name", None) == "uq_captcha_intents_completion":
            raise ApiError(409, "CAPTCHA_REUSED", "이미 사용된 인증 결과입니다.") from error
        raise
    except Exception:
        db.rollback()
        raise
