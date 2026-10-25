from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CaptchaIntent(Base):
    __tablename__ = "captcha_intents"
    __table_args__ = (
        UniqueConstraint("completion_id", name="uq_captcha_intents_completion"),
        CheckConstraint("(completion_id IS NULL) = (reservation_id IS NULL)",
                        name="ck_captcha_intents_consumed_pair"),
    )
    intent_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.user_id"), nullable=False, index=True)
    challenge_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completion_id: Mapped[str | None] = mapped_column(Text)
    reservation_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("reservations.reservation_id"), unique=True)
