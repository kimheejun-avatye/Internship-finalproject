# 관리자·채팅·메모 모델

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
    __table_args__ = (
        # 1:1방만 direct_key 를 가진다
        CheckConstraint("(type = 'DIRECT') = (direct_key IS NOT NULL)", name="ck_chat_room_direct_key"),
        # 삭제되지 않은 1:1방은 두 사람 사이에 하나만
        Index(
            "chat_room_direct_key_uniq",
            "direct_key",
            unique=True,
            postgresql_where=text("type = 'DIRECT' AND deleted_at IS NULL"),
        ),
    )

    chat_room_id: Mapped[uuid.UUID] = _uuid_pk()
    title: Mapped[Optional[str]] = mapped_column(Text)
    type: Mapped[ChatRoomType] = mapped_column(Enum(ChatRoomType, name="chat_room_type"), nullable=False)
    # 1:1방: 두 user_id 를 정렬해 ':' 로 이은 값
    direct_key: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = _created_at()
    # 채팅방 목록 최신순 정렬용. 메시지가 없으면 NULL
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


Index("ix_chat_room_last_message_at", ChatRoom.last_message_at.desc())


class ChatRoomMember(Base):
    __tablename__ = "chat_room_member"

    chat_room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_room.chat_room_id"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"), primary_key=True, index=True)
    joined_at: Mapped[datetime] = _created_at()
    # NULL = 참여 중
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("char_length(message) BETWEEN 1 AND 2000", name="ck_messages_length"),
        CheckConstraint("kind IN ('TEXT', 'RESERVATION')", name="ck_messages_kind"),
        CheckConstraint("(kind = 'RESERVATION') = (payload IS NOT NULL)", name="ck_messages_payload"),
    )

    message_id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    chat_room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_room.chat_room_id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # TEXT: 일반 메시지, RESERVATION: 서버가 보낸 예약 카드(payload 에 보낸 시점의 예약 정보)
    kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="TEXT")
    payload: Mapped[Optional[dict]] = mapped_column(JSONB(none_as_null=True))
    created_at: Mapped[datetime] = _created_at()


# 방별 최신순 커서 조회: (created_at, message_id) 기준
Index("ix_messages_room_created", Message.chat_room_id, Message.created_at.desc(), Message.message_id.desc())


def direct_key(user_a: uuid.UUID, user_b: uuid.UUID) -> str:
    return ":".join(sorted((str(user_a), str(user_b))))


class Memo(Base):
    __tablename__ = "memo"
    __table_args__ = (UniqueConstraint("reservation_id", "user_id", name="uq_memo_reservation_user"),)

    memo_id: Mapped[uuid.UUID] = _uuid_pk()
    reservation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reservations.reservation_id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())
