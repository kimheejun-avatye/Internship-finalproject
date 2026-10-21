"""실시간 이벤트 WS /api/ws."""

import pytest

pytestmark = pytest.mark.skip(reason="TODO: routes.ws, services.realtime 구현 후 활성화")


def test_connection_without_login_is_rejected(client):
    """close 4401."""
    ...


def test_connection_from_other_origin_is_rejected(client, seed):
    """close 4403."""
    ...


def test_ping_gets_pong(client, seed):
    ...


def test_only_members_receive_message_created(client, seed):
    """참여자(보낸 사람의 다른 탭 포함)만 message.created 를 받는다."""
    ...


def test_group_room_created_event(client, seed):
    """그룹방 참여자 전원이 room.created 를 받는다."""
    ...
