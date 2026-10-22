"""예약 HTTP 요청부터 Redis 보관과 웹소켓 수신까지 검증한다."""

import socket
from uuid import UUID

import pytest
from conftest import signin
from redis import Redis
from sqlalchemy import func, select
from test_ws import assert_nothing_pending, auth, connect, login, ready, receive

from app.db.session import SessionLocal
from app.models.reservations import Reservation
from app.models.rooms import Room
from app.services import notifications, realtime


@pytest.fixture
def booking(client, seed, notification_store, monkeypatch):
    from app.api.routes.notifications import get_notification_store
    from app.main import app

    host = seed()
    online = seed("online@example.com")
    offline = seed("offline@example.com")
    seed("outsider@example.com")
    store, redis, prefix = notification_store
    monkeypatch.setattr(notifications, "get_notification_store", lambda: store)
    app.dependency_overrides[get_notification_store] = lambda: store
    with SessionLocal() as db:
        room = Room(name="회의실 A", capacity=6)
        db.add(room)
        db.commit()
        room_id = room.room_id
    request = {
        "room_id": str(room_id), "title": "알림 연결 회의",
        "start_at": "2030-01-07T10:00:00+09:00",
        "end_at": "2030-01-07T11:00:00+09:00",
        "attendee_ids": [str(online), str(offline)],
    }
    try:
        yield request, host, online, offline, store, redis, prefix
    finally:
        app.dependency_overrides.pop(get_notification_store, None)


def test_booking_sends_online_and_preserves_offline_notifications(client, booking):
    request, host, online, offline, store, _, _ = booking
    host_session = login(client, "member")
    online_session = login(client, "online")
    outsider_session = login(client, "outsider")
    with connect(client, online_session) as online_ws, connect(client, outsider_session) as outsider_ws:
        ready(online_ws)
        ready(outsider_ws)
        response = client.post("/api/reservations", json=request, headers=auth(host_session))
        assert response.status_code == 201
        rid = response.json()["reservation_id"]
        event = receive(online_ws)
        assert event["type"] == "notification.created"
        assert event["data"]["reservation_id"] == rid
        assert event["data"]["title"] == "알림 연결 회의"
        assert event["data"] == store.list_for_user(online)[0].model_dump(mode="json")
        assert_nothing_pending(outsider_ws)
        # 같은 예약을 다시 처리해도 실시간 중복 알림을 보내지 않는다.
        notifications.notify_reservation_created(UUID(rid))
        assert_nothing_pending(online_ws)
    assert signin(client, "offline@example.com").status_code == 200
    response = client.get("/api/notifications")
    assert response.status_code == 200
    assert response.json()["items"][0]["reservation_id"] == rid
    assert all(len(store.list_for_user(uid)) == 1 for uid in (host, online, offline))


def test_rejected_booking_creates_no_notifications(client, booking):
    request, _, _, _, _, redis, prefix = booking
    assert signin(client).status_code == 200
    response = client.post("/api/reservations", json={**request, "attendee_ids": [str(UUID(int=99))]})
    assert response.status_code == 404
    assert list(redis.scan_iter(match=prefix + "*")) == []
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0


def test_redis_failure_keeps_booking_successful(client, booking, monkeypatch, caplog):
    request, _, _, _, _, _, _ = booking
    assert signin(client).status_code == 200
    with socket.socket() as unavailable:
        unavailable.bind(("127.0.0.1", 0))
        redis = Redis(host="127.0.0.1", port=unavailable.getsockname()[1], socket_connect_timeout=0.1)
        monkeypatch.setattr(notifications, "get_notification_store", lambda: notifications.NotificationStore(redis))
        try:
            response = client.post("/api/reservations", json=request)
        finally:
            redis.close()
    assert response.status_code == 201
    with SessionLocal() as db:
        assert db.get(Reservation, UUID(response.json()["reservation_id"])) is not None
    assert "Reservation notification storage failed" in caplog.text


def test_broken_websocket_keeps_notifications_in_redis(client, booking, monkeypatch):
    request, _, online, _, store, _, _ = booking
    host_session = login(client, "member")
    online_session = login(client, "online")
    with connect(client, online_session) as online_ws:
        ready(online_ws)
        server_socket, = realtime.manager.connections[online]

        async def fail_send(payload):
            raise RuntimeError("connection lost")

        monkeypatch.setattr(server_socket, "send_json", fail_send)
        response = client.post("/api/reservations", json=request, headers=auth(host_session))
        assert response.status_code == 201
        assert online not in realtime.manager.connections
    assert signin(client, "online@example.com").status_code == 200
    response = client.get("/api/notifications")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0] == store.list_for_user(online)[0].model_dump(mode="json")
