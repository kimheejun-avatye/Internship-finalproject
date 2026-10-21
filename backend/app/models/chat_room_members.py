from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatRoomMember(Base):
    __tablename__ = "chat_room_members"

    chat_room_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(
            "chat_rooms.chat_room_id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.user_id"),
        primary_key=True,
        index=True,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # NULL = 참여 중
    left_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
