# 회의실 일시 차단 조회. 예약·캘린더 기능도 이 함수로 차단 시간을 확인한다

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.room_blocks import RoomBlock


def overlapping_blocks(db: Session, room_id: UUID, start_at: datetime, end_at: datetime) -> list[RoomBlock]:
    """[start_at, end_at) 와 겹치는 차단 목록. 예약과 겹치는 구간은 이용할 수 없다."""
    statement = (
        select(RoomBlock)
        .where(
            RoomBlock.room_id == room_id,
            RoomBlock.start_at < end_at,
            RoomBlock.end_at > start_at,
        )
        .order_by(RoomBlock.start_at)
    )
    return list(db.scalars(statement))


def blocked_until(db: Session, room_id: UUID, now: datetime) -> Optional[datetime]:
    """now 시점에 걸려 있는 차단이 끝나는 시각. 차단 중이 아니면 None."""
    statement = select(RoomBlock.end_at).where(
        RoomBlock.room_id == room_id,
        RoomBlock.start_at <= now,
        RoomBlock.end_at > now,
    )
    return db.scalars(statement.order_by(RoomBlock.end_at.desc())).first()
