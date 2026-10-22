import logging
from collections import defaultdict
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, or_, select, tuple_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from app.core.exceptions import ApiError
from app.models.chat_memo import (
    ChatRoom,
    ChatRoomMember,
    ChatRoomType,
    Message,
    direct_key,
)
from app.models.users import User
from app.schemas.chat import MessageOut, RoomSummaryOut
from app.services import clock, cursors, realtime
from app.services.users import escape_like

logger = logging.getLogger(__name__)

# DB 는 developer 의 chat_memo 모델(chat_room, chat_room_member, messages)을 쓴다.
# 메시지 작성자는 messages.user_id, 본문은 messages.message 로 API 이름과 같다.

# 자동 제목에 보여줄 이름 수. 공통 문서에서 형식이 확정되면 auto_title 과 함께 바꾼다
AUTO_TITLE_NAMES = 2


def room_not_found():
    # 참여자가 아닌 경우도 방의 존재를 숨기려고 403 대신 404
    return ApiError(404, "CHAT_ROOM_NOT_FOUND", "채팅방을 찾을 수 없습니다.")


def member_invalid():
    return ApiError(400, "CHAT_MEMBER_INVALID", "대화할 수 없는 사용자가 포함되어 있습니다.")


def self_not_allowed():
    return ApiError(400, "CHAT_SELF_NOT_ALLOWED", "나와의 대화방은 만들 수 없습니다.")


def too_few_members():
    return ApiError(422, "CHAT_MEMBER_TOO_FEW", "나를 제외한 참여자가 2명 이상이어야 합니다.")


def cursor_invalid():
    return ApiError(400, "CHAT_CURSOR_INVALID", "잘못된 목록 위치입니다.")


# ---- 커서: 방 목록 (last_activity_at, chat_room_id), 메시지 (created_at, message_id) ----


def encode_cursor(at: datetime, row_id: UUID) -> str:
    return cursors.encode(at.isoformat(), row_id)


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        at, row_id = cursors.decode(cursor, 2)
        at = datetime.fromisoformat(at)
        if at.tzinfo is None:
            raise ValueError("naive datetime")
        return at, UUID(row_id)
    except ValueError:
        raise cursor_invalid()


# ---- 권한 ----


def require_member(db, chat_room_id: UUID, user_id: UUID) -> ChatRoom:
    """방이 있고 삭제되지 않았으며 내가 현재 참여자일 때만 방을 돌려준다. 아니면 room_not_found()."""
    room = db.scalar(
        select(ChatRoom)
        .join(ChatRoomMember, ChatRoomMember.chat_room_id == ChatRoom.chat_room_id)
        .where(
            ChatRoom.chat_room_id == chat_room_id,
            ChatRoom.deleted_at.is_(None),
            ChatRoomMember.user_id == user_id,
            ChatRoomMember.left_at.is_(None),
        )
    )
    if room is None:
        raise room_not_found()
    return room


def member_ids(db, chat_room_id: UUID) -> list[UUID]:
    """이벤트 대상: DB 기준 현재 참여자(left_at IS NULL) 전원."""
    return list(
        db.scalars(
            select(ChatRoomMember.user_id).where(
                ChatRoomMember.chat_room_id == chat_room_id,
                ChatRoomMember.left_at.is_(None),
            )
        )
    )


def valid_members(db, user_ids: list[UUID]) -> list[User]:
    """소속과 관계없이 승인·비차단 사용자만 채팅에 참여할 수 있다."""
    found = list(
        db.scalars(
            select(User).where(
                User.user_id.in_(user_ids),
                User.blocked_at.is_(None),
                User.approved_at.is_not(None),
            )
        )
    )
    if len(found) != len(set(user_ids)):
        raise member_invalid()
    return found


# ---- 응답 구성 ----


def auto_title(names: list[str]) -> str:
    """제목 없는 방의 표시 제목. 임시 형식: "김민수, 이영희 외 2명"."""
    if not names:
        return "대화 상대 없음"
    shown = ", ".join(names[:AUTO_TITLE_NAMES])
    rest = len(names) - AUTO_TITLE_NAMES
    return f"{shown} 외 {rest}명" if rest > 0 else shown


def message_out(message: Message, sender_name: str, client_id: Optional[str] = None) -> dict:
    return {
        "message_id": message.message_id,
        "chat_room_id": message.chat_room_id,
        "user_id": message.user_id,
        "sender": {"user_id": message.user_id, "name": sender_name},
        "message": message.message,
        "created_at": message.created_at,
        "client_id": client_id,
    }


def _room_parts(db, room_ids: list[UUID]):
    """방 여러 개의 현재 참여자와 마지막 메시지를 쿼리 두 번으로 읽는다."""
    members = defaultdict(list)
    rows = db.execute(
        select(ChatRoomMember.chat_room_id, User.user_id, User.name)
        .join(User, User.user_id == ChatRoomMember.user_id)
        .where(ChatRoomMember.chat_room_id.in_(room_ids), ChatRoomMember.left_at.is_(None))
        .order_by(User.name, User.user_id)
    )
    for chat_room_id, user_id, name in rows:
        members[chat_room_id].append({"user_id": user_id, "name": name})

    # 방마다 가장 최근 메시지 한 건: DISTINCT ON (chat_room_id)
    last = {}
    rows = db.execute(
        select(Message, User.name)
        .join(User, User.user_id == Message.user_id)
        .where(Message.chat_room_id.in_(room_ids))
        .distinct(Message.chat_room_id)
        .order_by(Message.chat_room_id, Message.created_at.desc(), Message.message_id.desc())
    )
    for message, name in rows:
        last[message.chat_room_id] = message_out(message, name)
    return members, last


def _room_out(room: ChatRoom, me_id: UUID, members: list[dict], last: Optional[dict], detail: bool) -> dict:
    others = [m for m in members if m["user_id"] != me_id]
    out = {
        "chat_room_id": room.chat_room_id,
        "type": room.type,
        "title": room.title,
        "display_title": room.title or auto_title([m["name"] for m in others]),
        "member_count": len(members),
        "last_message": last,
        "last_activity_at": room.last_message_at or room.created_at,
        "created_at": room.created_at,
    }
    if detail:
        out["members"] = others
    return out


def room_summaries(db, rooms: list[ChatRoom], me_id: UUID) -> list[dict]:
    """RoomSummary 목록. 받는 사람(me_id)마다 display_title 과 members 가 다르다."""
    if not rooms:
        return []
    members, last = _room_parts(db, [r.chat_room_id for r in rooms])
    return [
        _room_out(r, me_id, members[r.chat_room_id], last.get(r.chat_room_id), detail=False)
        for r in rooms
    ]


def room_detail_out(db, room: ChatRoom, me_id: UUID) -> dict:
    members, last = _room_parts(db, [room.chat_room_id])
    return _room_out(room, me_id, members[room.chat_room_id], last.get(room.chat_room_id), detail=True)


# ---- 실시간 이벤트: 모두 commit 이 끝난 뒤 부른다 ----


def _publish_room_updated(db, room: ChatRoom, user_ids: list[UUID]) -> None:
    """room.updated 는 받는 사람마다 display_title 이 달라 사람별로 만든다."""
    targets = realtime.manager.online(user_ids)
    if not targets:
        return
    members, last = _room_parts(db, [room.chat_room_id])
    for uid in targets:
        summary = _room_out(room, uid, members[room.chat_room_id], last.get(room.chat_room_id), detail=False)
        data = RoomSummaryOut.model_validate(summary).model_dump(mode="json")
        realtime.publish_to_users([uid], realtime.event("room.updated", data))


def _publish_message(db, room: ChatRoom, message: dict) -> None:
    """방 현재 참여자 전원(보낸 사람의 다른 탭 포함)에게 message.created, 이어서 각자 기준 room.updated."""
    targets = realtime.manager.online(member_ids(db, room.chat_room_id))
    if not targets:
        return
    data = MessageOut.model_validate(message).model_dump(mode="json")
    realtime.publish_to_users(targets, realtime.event("message.created", data))
    # last_message_at 은 SQL UPDATE 로 바꿨으므로 다시 읽어 최신 요약을 만든다
    db.refresh(room)
    _publish_room_updated(db, room, targets)


def _safely(publish, *args) -> None:
    # 저장은 이미 끝났다. 이벤트를 만들다 실패해도 요청은 성공으로 돌려준다
    try:
        publish(*args)
    except Exception:
        logger.warning("Chat event publish failed", exc_info=True)


# ---- 채팅방 ----


def list_rooms(db, user: User, q: str, cursor: Optional[str], limit: int) -> dict:
    """내가 참여 중인 삭제되지 않은 방. last_activity_at, chat_room_id 내림차순 keyset 페이지네이션."""
    activity = func.coalesce(ChatRoom.last_message_at, ChatRoom.created_at)
    query = (
        select(ChatRoom)
        .join(ChatRoomMember, ChatRoomMember.chat_room_id == ChatRoom.chat_room_id)
        .where(
            ChatRoomMember.user_id == user.user_id,
            ChatRoomMember.left_at.is_(None),
            ChatRoom.deleted_at.is_(None),
        )
    )
    if q:
        pattern = f"%{escape_like(q)}%"
        # 제목이 없으면 표시 제목이 참여자 이름이므로, 나를 뺀 참여자 이름으로 찾는다
        other = aliased(ChatRoomMember)
        other_named = (
            select(other.user_id)
            .join(User, User.user_id == other.user_id)
            .where(
                other.chat_room_id == ChatRoom.chat_room_id,
                other.left_at.is_(None),
                other.user_id != user.user_id,
                User.name.ilike(pattern, escape="\\"),
            )
            .exists()
        )
        query = query.where(
            or_(
                ChatRoom.title.ilike(pattern, escape="\\"),
                and_(ChatRoom.title.is_(None), other_named),
            )
        )
    if cursor:
        query = query.where(tuple_(activity, ChatRoom.chat_room_id) < tuple_(*decode_cursor(cursor)))
    # 한 개 더 읽어 다음 페이지가 있는지 본다
    rooms = list(
        db.scalars(query.order_by(activity.desc(), ChatRoom.chat_room_id.desc()).limit(limit + 1))
    )
    page = rooms[:limit]
    next_cursor = None
    if len(rooms) > limit:
        last = page[-1]
        next_cursor = encode_cursor(last.last_message_at or last.created_at, last.chat_room_id)
    return {"items": room_summaries(db, page, user.user_id), "next_cursor": next_cursor}


def room_detail(db, chat_room_id: UUID, user: User) -> dict:
    """방 상세 + 참여자. require_member 를 거친다."""
    room = require_member(db, chat_room_id, user.user_id)
    return room_detail_out(db, room, user.user_id)


def _direct_room(db, key: str) -> Optional[ChatRoom]:
    return db.scalar(
        select(ChatRoom).where(
            ChatRoom.type == ChatRoomType.DIRECT,
            ChatRoom.direct_key == key,
            ChatRoom.deleted_at.is_(None),
        )
    )


def open_direct(db, user: User, target_id: UUID) -> tuple[dict, bool]:
    """1:1방을 열고 (RoomDetail, 새로 만들었는지)를 돌려준다."""
    me_id = user.user_id
    if target_id == me_id:
        raise self_not_allowed()
    valid_members(db, [target_id])

    key = direct_key(me_id, target_id)
    room = _direct_room(db, key)
    if room is not None:
        return room_detail_out(db, room, me_id), False

    now = clock.now()
    try:
        room = ChatRoom(type=ChatRoomType.DIRECT, direct_key=key, created_by=me_id, created_at=now)
        db.add(room)
        db.flush()
        db.add_all(
            ChatRoomMember(chat_room_id=room.chat_room_id, user_id=uid, joined_at=now)
            for uid in (me_id, target_id)
        )
        db.commit()
    except IntegrityError:
        # 상대가 같은 순간 같은 방을 만들었다(chat_room_direct_key_uniq): 그 방을 돌려준다
        db.rollback()
        room = _direct_room(db, key)
        if room is None:
            raise
        return room_detail_out(db, room, me_id), False
    _safely(_publish_room_updated, db, room, [me_id, target_id])
    return room_detail_out(db, room, me_id), True


def create_group(db, user: User, title: Optional[str], member_ids: list[UUID]) -> dict:
    """그룹방을 만들고 RoomDetail 을 돌려준다. 만든 사람은 자동 참여하고 title 이 없으면 자동 제목."""
    me_id = user.user_id
    others = list(dict.fromkeys(uid for uid in member_ids if uid != me_id))
    if len(others) < 2:
        raise too_few_members()
    valid_members(db, others)

    now = clock.now()
    room = ChatRoom(type=ChatRoomType.GROUP, title=title, created_by=me_id, created_at=now)
    db.add(room)
    db.flush()
    db.add_all(
        ChatRoomMember(chat_room_id=room.chat_room_id, user_id=uid, joined_at=now)
        for uid in (me_id, *others)
    )
    db.commit()
    _safely(_publish_room_updated, db, room, [me_id, *others])
    return room_detail_out(db, room, me_id)


# ---- 메시지 ----


def list_messages(
    db, chat_room_id: UUID, user: User, cursor: Optional[str], limit: int
) -> dict:
    """created_at, message_id 최신순 keyset 페이지네이션. cursor 가 있으면 그보다 오래된 메시지만."""
    require_member(db, chat_room_id, user.user_id)
    query = (
        select(Message, User.name)
        .join(User, User.user_id == Message.user_id)
        .where(Message.chat_room_id == chat_room_id)
    )
    if cursor:
        query = query.where(
            tuple_(Message.created_at, Message.message_id) < tuple_(*decode_cursor(cursor))
        )
    # 한 건 더 읽어 다음 페이지가 있는지 본다
    rows = db.execute(
        query.order_by(Message.created_at.desc(), Message.message_id.desc()).limit(limit + 1)
    ).all()
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = page[-1][0]
        next_cursor = encode_cursor(last.created_at, last.message_id)
    return {"items": [message_out(m, name) for m, name in page], "next_cursor": next_cursor}


def send_message(
    db, chat_room_id: UUID, user: User, message: str, client_id: Optional[str]
) -> dict:
    """메시지를 저장하고 Message(+client_id)를 돌려준다.

    한 트랜잭션: INSERT messages + chat_room.last_message_at UPDATE → commit
    → commit 이 끝난 뒤 이벤트를 보낸다. commit 전에 push 하지 않는다.
    """
    room = require_member(db, chat_room_id, user.user_id)
    now = clock.now()
    saved = Message(chat_room_id=chat_room_id, user_id=user.user_id, message=message, created_at=now)
    db.add(saved)
    # 동시에 보낸 메시지가 먼저 commit 해도 시각이 뒤로 가지 않게 한다. GREATEST 는 NULL 을 무시한다
    db.execute(
        update(ChatRoom)
        .where(ChatRoom.chat_room_id == chat_room_id)
        .values(last_message_at=func.greatest(ChatRoom.last_message_at, now))
    )
    db.commit()
    out = message_out(saved, user.name, client_id)
    _safely(_publish_message, db, room, out)
    return out
