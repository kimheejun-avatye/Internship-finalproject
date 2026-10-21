"""채팅방·메시지 REST API."""

import pytest

pytestmark = pytest.mark.skip(reason="TODO: services.chat 구현 후 활성화")


# ---- 1:1방 ----


def test_direct_room_is_reused_for_same_pair(client, seed):
    """같은 상대로 두 번 요청하면 201 → 200, 같은 chat_room_id."""
    ...


def test_direct_room_with_other_team_is_rejected(client, seed):
    """400 CHAT_MEMBER_INVALID."""
    ...


def test_direct_room_with_myself_is_rejected(client, seed):
    """400 CHAT_SELF_NOT_ALLOWED."""
    ...


# ---- 그룹방 ----


def test_group_room_with_other_team_is_rejected(client, seed):
    """400 CHAT_MEMBER_INVALID."""
    ...


def test_group_room_needs_two_other_members(client, seed):
    """member_ids 1명 → 422, [나, A] → 422 CHAT_MEMBER_TOO_FEW."""
    ...


# ---- 권한 ----


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/chat/rooms/{id}"),
    ("GET", "/api/chat/rooms/{id}/messages"),
    ("POST", "/api/chat/rooms/{id}/messages"),
])
def test_non_member_gets_404(client, seed, method, path):
    """CHAT_ROOM_NOT_FOUND."""
    ...


def test_post_without_csrf_header_is_rejected(client, seed):
    """403 CSRF_FAILED."""
    ...


# ---- 메시지 ----


def test_message_cursor_pagination(client, seed):
    """35개 → limit=30 은 has_more=true, before=next_before 로 나머지 5개."""
    ...


def test_invalid_cursor_is_rejected(client, seed):
    """다른 방의 message_id 를 before 로 주면 400 CHAT_CURSOR_INVALID."""
    ...


def test_room_list_orders_by_latest_message(client, seed):
    """메시지가 온 방이 위로. 메시지 없는 방은 뒤로."""
    ...
