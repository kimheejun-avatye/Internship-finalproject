from typing import Optional
from uuid import UUID

from app.core.exceptions import ApiError
from app.models.chat_rooms import ChatRoom
from app.models.users import User


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
    return ApiError(400, "CHAT_CURSOR_INVALID", "잘못된 메시지 위치입니다.")


# ---- 권한 ----


def require_member(db, chat_room_id: UUID, user_id: UUID) -> ChatRoom:
    """방이 있고 삭제되지 않았으며 내가 현재 참여자일 때만 방을 돌려준다. 아니면 room_not_found()."""
    # TODO: ChatRoom + ChatRoomMember join, deleted_at IS NULL, left_at IS NULL
    raise NotImplementedError


def member_ids(db, chat_room_id: UUID) -> list[UUID]:
    """이벤트 대상: DB 기준 현재 참여자(left_at IS NULL) 전원."""
    # TODO
    raise NotImplementedError


def valid_teammates(db, user: User, user_ids: list[UUID]) -> list[User]:
    """user_ids 전원이 user 와 같은 팀의 승인·비차단 사용자인지 확인한다. 하나라도 아니면 member_invalid()."""
    # TODO
    raise NotImplementedError


# ---- 채팅방 ----


def list_rooms(db, user: User) -> list[dict]:
    """내가 참여 중인 삭제되지 않은 방. last_message_at DESC NULLS LAST, created_at DESC.

    N+1 없이: 방 목록 → 참여자 일괄 조회(IN) → 방별 최신 메시지(DISTINCT ON) 일괄 조회.
    """
    # TODO
    raise NotImplementedError


def room_detail(db, chat_room_id: UUID, user: User) -> dict:
    """방 상세 + 참여자. require_member 를 거친다."""
    # TODO
    raise NotImplementedError


def open_direct(db, user: User, other_id: UUID) -> tuple[dict, bool]:
    """1:1방을 열고 (ChatRoomOut, 새로 만들었는지)를 돌려준다.

    - 상대가 나 → self_not_allowed()
    - 상대가 다른 팀·차단·승인 대기·없음 → member_invalid()
    - direct_key 로 기존 방이 있으면 그대로, 없으면 방 + 참여자 2명 생성 후 commit
    - 동시 생성으로 IntegrityError → rollback 후 다시 조회해 기존 방 반환
    """
    # TODO
    raise NotImplementedError


def create_group(db, user: User, title: str, member_ids: list[UUID]) -> dict:
    """그룹방을 만들고 ChatRoomOut 을 돌려준다.

    - member_ids 에서 나를 빼고 2명 미만이면 too_few_members()
    - 전원 valid_teammates, 만든 사람 자동 참여
    - commit 후 참여자 전원에게 room.created 이벤트 (각자 시점의 ChatRoomOut)
    """
    # TODO
    raise NotImplementedError


# ---- 메시지 ----


def list_messages(
    db, chat_room_id: UUID, user: User, before: Optional[UUID], limit: int
) -> dict:
    """최신순 keyset 페이지네이션. MessagePageOut 형식을 돌려준다.

    - before 가 있으면 그 메시지의 (created_at, message_id) 보다 작은 것만.
      before 가 이 방의 메시지가 아니면 cursor_invalid()
    - limit + 1 개를 읽어 has_more 를 판단한다
    """
    # TODO
    raise NotImplementedError


def send_message(
    db, chat_room_id: UUID, user: User, content: str, client_id: Optional[str]
) -> dict:
    """메시지를 저장하고 MessageOut(+client_id)을 돌려준다.

    한 트랜잭션: INSERT + chat_rooms.last_message_at UPDATE → commit
    → commit 이 끝난 뒤 publish_to_users(member_ids, message.created). commit 전에 push 하지 않는다.
    """
    # TODO
    raise NotImplementedError
