# 관리자의 회의실 일시 차단 이력. [start_at, end_at) 동안은 기존 예약이 있어도 이용할 수 없다

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RoomBlock(Base):
    __tablename__ = "room_blocks"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_room_blocks_time_order"),
        # 회의실별로 지금 걸린 차단, 예약과 겹치는 차단을 찾을 때 쓴다
        Index("ix_room_blocks_room_end", "room_id", "end_at"),
    )

    block_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    room_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("rooms.room_id"), nullable=False)
    # 차단한 관리자
    blocked_by: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.user_id"), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
