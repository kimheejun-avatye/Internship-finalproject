from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Enum as SAEnum,
    Integer,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RoomStatus(str, Enum):
    ACTIVE = "ACTIVE"
    BLOCK = "BLOCK"

# Reservation.py에 있는 것처럼 rooms 테이블에도 제약을 걸어야 할지.

class Room(Base):
    __tablename__ = "rooms"

    __table_args__ = (
        # 회의실 수용 인원은 0보다 커야 함
        CheckConstraint(
            "capacity > 0",
            name="ck_rooms_capacity",
        ),
    )

    room_id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    name: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    status: Mapped[RoomStatus] = mapped_column(
        SAEnum(RoomStatus, name="room_status"),
        nullable=False,
        default=RoomStatus.ACTIVE,
    )

    capacity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
