from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatRoomType(str, Enum):
    DIRECT = "DIRECT"
    GROUP = "GROUP"


class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    __table_args__ = (
        # 1:1방만 direct_key 를 가진다
        CheckConstraint(
            "(type = 'DIRECT') = (direct_key IS NOT NULL)",
            name="ck_chat_rooms_direct_key",
        ),
        # 삭제되지 않은 1:1방은 두 사람 사이에 하나만
        Index(
            "chat_rooms_direct_key_uniq",
            "direct_key",
            unique=True,
            postgresql_where=text("type = 'DIRECT' AND deleted_at IS NULL"),
        ),
    )

    chat_room_id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    type: Mapped[ChatRoomType] = mapped_column(
        SAEnum(ChatRoomType, name="chat_room_type"),
        nullable=False,
    )

    # 그룹방 이름. 1:1방은 NULL 이고 응답에서 상대방 이름으로 채운다
    title: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # 1:1방: 두 user_id 를 정렬해 ':' 로 이은 값
    direct_key: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    created_by: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.user_id"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # 채팅방 목록 최신순 정렬용. 메시지가 없으면 NULL
    last_message_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


Index("ix_chat_rooms_last_message_at", ChatRoom.last_message_at.desc())


def direct_key(user_a: UUID, user_b: UUID) -> str:
    return ":".join(sorted((str(user_a), str(user_b))))
