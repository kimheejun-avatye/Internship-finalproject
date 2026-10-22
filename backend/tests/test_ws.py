"""실시간 이벤트 WS /api/ws."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from conftest import signin
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.api.routes import ws as ws_route
from app.core.config import settings
from app.db.session import SessionLocal
from app.models import Team, UserSession
from app.services import realtime

ORIGIN = "http://127.0.0.1:5174"
# 이벤트가 오지 않을 때 테스트가 멈추지 않도록 별도 스레드에서 시간 제한을 두고 받는다
_receiver = ThreadPoolExecutor(max_workers=8)


@pytest.fixture
def people(seed):
    return SimpleNamespace(
        me=seed("me@example.com", name="나"),
        kim=seed("kim@example.com", name="김민수", team=Team.GURU),
        lee=seed("lee@example.com", name="이영희"),
    )


def login(client, who="me"):
    """로그인하고 세션 쿠키·CSRF 를 돌려준다. 한 클라이언트로 여러 사용자를 다루려고 쿠키는 요청마다 직접 붙인다."""
    r = signin(client, f"{who}@example.com")
    assert r.status_code == 200
    session = SimpleNamespace(
        token=client.cookies.get(settings.cookie_name), csrf=r.json()["csrf_token"]
    )
    client.cookies.clear()
    return session


def auth(session):
    return {"cookie": f"{settings.cookie_name}={session.token}", "X-CSRF-Token": session.csrf}


def connect(client, session=None, origin=ORIGIN):
    headers = {"origin": origin}
    if session is not None:
        headers["cookie"] = f"{settings.cookie_name}={session.token}"
    return client.websocket_connect("/api/ws", headers=headers)


def receive(ws, timeout=3):
    return _receiver.submit(ws.receive_json).result(timeout)


def ready(ws):
    assert receive(ws) == {"type": "ready"}
    return ws


def assert_nothing_pending(ws):
    """ping 을 보내 바로 pong 이 오면 그 앞에 쌓인 이벤트가 없다는 뜻이다."""
    ws.send_json({"type": "ping"})
    assert receive(ws) == {"type": "pong"}


def closed_code(ws):
    with pytest.raises(WebSocketDisconnect) as caught:
        receive(ws)
    return caught.value.code


# ---- 연결 ----


def test_connection_without_login_is_closed_with_4401(client):
    with connect(client) as ws:
        assert closed_code(ws) == ws_route.CLOSE_UNAUTHORIZED


def test_connection_from_other_origin_is_rejected(client, people):
    me = login(client)
    with pytest.raises(WebSocketDisconnect) as caught:
        with connect(client, me, origin="https://evil.example.com"):
            pass
    assert caught.value.code == ws_route.CLOSE_FORBIDDEN_ORIGIN


def test_ready_then_ping_pong(client, people):
    me = login(client)
    with connect(client, me) as ws:
        ready(ws)
        # ping 이 아닌 것은 무시한다
        ws.send_text("not json")
        ws.send_json({"type": "something"})
        assert_nothing_pending(ws)


def test_ping_does_not_extend_login(client, people):
    me = login(client)

    def idle_expires_at():
        with SessionLocal() as db:
            return db.scalar(select(UserSession.idle_expires_at).where(UserSession.user_id == people.me))

    before = idle_expires_at()
    with connect(client, me) as ws:
        ready(ws)
        assert_nothing_pending(ws)
    assert idle_expires_at() == before


def test_ping_after_logout_closes_with_4401(client, people):
    me = login(client)
    with connect(client, me) as ws:
        ready(ws)
        assert client.post("/api/auth/logout", json={}, headers=auth(me)).status_code == 204
        ws.send_json({"type": "ping"})
        assert closed_code(ws) == ws_route.CLOSE_UNAUTHORIZED


def test_ping_after_session_expiry_closes_with_4401(client, people, time):
    me = login(client)
    with connect(client, me) as ws:
        ready(ws)
        time.advance(seconds=settings.session_idle_seconds + 1)
        ws.send_json({"type": "ping"})
        assert closed_code(ws) == ws_route.CLOSE_UNAUTHORIZED


def test_silent_connection_is_closed(client, people, monkeypatch):
    monkeypatch.setattr(ws_route, "IDLE_TIMEOUT_SECONDS", 0.2)
    me = login(client)
    with connect(client, me) as ws:
        ready(ws)
        assert closed_code(ws) == ws_route.CLOSE_IDLE_TIMEOUT


# ---- 채팅 이벤트 ----


def test_message_created_reaches_only_members(client, people):
    me, kim, lee = login(client, "me"), login(client, "kim"), login(client, "lee")
    room_id = client.post(
        "/api/chat/rooms/direct", json={"target_user_id": str(people.kim)}, headers=auth(me)
    ).json()["chat_room_id"]

    with connect(client, me) as me_tab1, connect(client, me) as me_tab2, \
            connect(client, kim) as kim_ws, connect(client, lee) as lee_ws:
        for ws in (me_tab1, me_tab2, kim_ws, lee_ws):
            ready(ws)

        r = client.post(
            f"/api/chat/rooms/{room_id}/messages",
            json={"message": "안녕하세요", "client_id": "tmp-1"},
            headers=auth(kim),
        )
        assert r.status_code == 201
        sent = r.json()

        expected_titles = {id(me_tab1): "김민수", id(me_tab2): "김민수", id(kim_ws): "나"}
        # 보낸 사람(kim)의 탭도 받는다. HTTP 응답과 message_id 로 중복을 없앤다
        for ws in (me_tab1, me_tab2, kim_ws):
            created = receive(ws)
            assert created["type"] == "message.created"
            assert created["data"] == sent
            assert created["data"]["client_id"] == "tmp-1"

            updated = receive(ws)
            assert updated["type"] == "room.updated"
            assert updated["data"]["chat_room_id"] == room_id
            assert updated["data"]["display_title"] == expected_titles[id(ws)]
            assert updated["data"]["last_message"]["message_id"] == sent["message_id"]
            assert datetime.fromisoformat(updated["data"]["last_activity_at"].replace("Z", "+00:00")) == datetime.fromisoformat(
                sent["created_at"].replace("Z", "+00:00")
            )

        # 참여자가 아닌 lee 에게는 아무것도 가지 않는다
        assert_nothing_pending(lee_ws)


def test_new_rooms_send_room_updated(client, people):
    me, kim, lee = login(client, "me"), login(client, "kim"), login(client, "lee")

    with connect(client, me) as me_ws, connect(client, kim) as kim_ws, connect(client, lee) as lee_ws:
        for ws in (me_ws, kim_ws, lee_ws):
            ready(ws)

        group = client.post(
            "/api/chat/rooms/group",
            json={"title": "기획 회의", "member_ids": [str(people.kim), str(people.lee)]},
            headers=auth(me),
        ).json()
        for ws in (me_ws, kim_ws, lee_ws):
            updated = receive(ws)
            assert updated["type"] == "room.updated"
            assert updated["data"]["chat_room_id"] == group["chat_room_id"]
            assert updated["data"]["display_title"] == "기획 회의"
            assert updated["data"]["member_count"] == 3

        # 새 1:1방은 두 사람에게, 기존 방을 다시 열 때는 보내지 않는다
        opened = client.post(
            "/api/chat/rooms/direct", json={"target_user_id": str(people.kim)}, headers=auth(me)
        )
        assert opened.status_code == 201
        assert receive(me_ws)["data"]["display_title"] == "김민수"
        assert receive(kim_ws)["data"]["display_title"] == "나"
        assert_nothing_pending(lee_ws)

        reopened = client.post(
            "/api/chat/rooms/direct", json={"target_user_id": str(people.kim)}, headers=auth(me)
        )
        assert reopened.status_code == 200
        assert_nothing_pending(me_ws)
        assert_nothing_pending(kim_ws)


# ---- publish_to_users ----


def test_publish_without_connections_does_nothing():
    # 접속자가 없거나 루프가 없어도 예외 없이 지나간다 (예약 알림 저장을 막으면 안 된다)
    realtime.publish_to_users([uuid4()], realtime.event("notification.created", {"x": 1}))


def test_broken_socket_is_removed_and_publish_does_not_raise():
    class BrokenSocket:
        async def send_json(self, payload):
            raise RuntimeError("connection lost")

    user_id = uuid4()

    async def scenario():
        realtime.manager.connect(user_id, BrokenSocket())
        await realtime.manager.send([user_id], realtime.event("message.created", {}))

    asyncio.run(scenario())
    assert user_id not in realtime.manager.connections
    # 루프가 닫힌 뒤에도 예외 없이 지나간다
    realtime.publish_to_users([user_id], realtime.event("message.created", {}))
