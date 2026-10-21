# 사용자 모델

import enum
from typing import Optional
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
 
from app.db.base import Base

class Team(str, enum.Enum):
    AVATYE = "AVATYE"
    GURU = "GURU"


class Role(str, enum.Enum):
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # 차단되지 않은 회원끼리만 이메일 고유. 위반 시 IntegrityError(constraint_name 으로 구분)
        Index(
            "users_email_active_uniq",
            "email",
            unique=True,
            postgresql_where=text("blocked_at IS NULL"),
        ),
        # 정규화되지 않은 이메일이 코드 실수로 들어오는 것을 DB 에서도 막는다
        CheckConstraint("email = lower(btrim(email))", name="users_email_normalized"),
        # 숫자만, 010 등으로 시작하는 10~11자리. NULL(파기 후)은 통과한다
        CheckConstraint(r"phone ~ '^01[016789][0-9]{7,8}$'", name="users_phone_format"),
    )
    # INSERT 할 때 DB 가 만든 user_id, role, created_at 을 RETURNING 으로 바로 받아온다
    __mapper_args__ = {"eager_defaults": True}
 
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    birth_date: Mapped[Optional[date]] = mapped_column(Date)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    team: Mapped[Team] = mapped_column(Enum(Team, name="team_type"), nullable=False)
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="role_type"), nullable=False, server_default=Role.MEMBER.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # NULL = 승인 대기
    blocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # NULL = 정상
 
    @property
    def is_pending(self) -> bool:
        return self.approved_at is None and self.blocked_at is None
