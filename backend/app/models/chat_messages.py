from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    __table_args__ = (
        # 메시지는 1~2000자
        CheckConstraint(
            "char_length(content) BETWEEN 1 AND 2000",
            name="ck_chat_messages_content_length",
        ),
    )

    message_id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    chat_room_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(
            "chat_rooms.chat_room_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    sender_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.user_id"),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


# 방별 최신순 커서 조회: (created_at, message_id) 기준
Index(
    "ix_chat_messages_room_created",
    ChatMessage.chat_room_id,
    ChatMessage.created_at.desc(),
    ChatMessage.message_id.desc(),
)
