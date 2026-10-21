# 관리자·채팅·메모 모델

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _uuid_pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))


def _created_at():
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ChatRoomType(str, enum.Enum):
    DIRECT = "DIRECT"
    GROUP = "GROUP"


class Admin(Base):
    __tablename__ = "admin"
    __table_args__ = (UniqueConstraint("user_id", name="uq_admin_user_id"),)

    admin_id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    created_at: Mapped[datetime] = _created_at()


class ChatRoom(Base):
    __tablename__ = "chat_room"

    chat_room_id: Mapped[uuid.UUID] = _uuid_pk()
    title: Mapped[Optional[str]] = mapped_column(Text)
    type: Mapped[ChatRoomType] = mapped_column(Enum(ChatRoomType, name="chat_room_type"), nullable=False)
    created_at: Mapped[datetime] = _created_at()
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ChatRoomMember(Base):
    __tablename__ = "chat_room_member"

    chat_room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_room.chat_room_id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"), primary_key=True)


class Message(Base):
    __tablename__ = "messages"

    message_id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    chat_room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_room.chat_room_id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = _created_at()


class Memo(Base):
    __tablename__ = "memo"

    memo_id: Mapped[uuid.UUID] = _uuid_pk()
    reservation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reservations.reservation_id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())
