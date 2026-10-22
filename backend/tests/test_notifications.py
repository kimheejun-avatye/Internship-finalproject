"""실제 PostgreSQL과 별도 Redis 키로 알림 저장을 검증한다."""

import json
import socket
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from conftest import signin
from redis import Redis

from app.core.exceptions import ApiError
from app.db.session import SessionLocal
from app.main import app
from app.models.chat_memo import Memo
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room


@pytest.fixture
def notification_data(seed, time):
    host = seed()
    invited = seed("invited@example.com")
    unrelated = seed("unrelated@example.com")
    start = datetime(2026, 10, 23, 1, tzinfo=timezone.utc)
    with SessionLocal() as db:
        room = Room(name="회의실 A", capacity=6)
        db.add(room)
        db.flush()
        reservation = Reservation(
            room_id=room.room_id, user_id=host, title="기획 회의",
            start_at=start, end_at=start + timedelta(hours=1), created_at=time.value,
        )
        db.add(reservation)
        db.flush()
        rid = reservation.reservation_id
        db.add_all([
            ReservationAttendee(reservation_id=rid, user_id=uid)
            for uid in (host, invited)
        ])
        db.add(Memo(reservation_id=rid, user_id=host, memo="비공개 메모"))
        db.commit()
    return rid, host, invited, unrelated


def test_notification_is_saved_for_each_attendee_without_a_websocket(notification_store, notification_data):
    from app.services.notifications import NotificationService

    store, client, prefix = notification_store
    rid, host, invited, unrelated = notification_data
    with SessionLocal() as db:
        result = NotificationService(db, store).create_for_reservation(rid)
    assert set(result) == {invited}
    for uid in (invited,):
        saved = json.loads(client.lindex(prefix + str(uid), 0))
        assert saved["reservation_id"] == str(rid)
        assert saved["type"] == "reservation.created"
        assert saved["title"] == "기획 회의"
        assert saved["room_name"] == "회의실 A"
        assert datetime.fromisoformat(saved["start_at"]) == datetime(2026, 10, 23, 1, tzinfo=timezone.utc)
        assert datetime.fromisoformat(saved["end_at"]) == datetime(2026, 10, 23, 2, tzinfo=timezone.utc)
        assert all(text in saved["message"] for text in ("기획 회의", "회의실 A", "10:00", "11:00"))
        assert "비공개 메모" not in json.dumps(saved, ensure_ascii=False)
    assert client.exists(prefix + str(host)) == 0
    with SessionLocal() as db:
        assert db.get(ReservationAttendee, (rid, host)) is not None
    assert client.exists(prefix + str(unrelated)) == 0


def test_repeated_generation_keeps_original_notification(notification_store, notification_data, time):
    from app.services.notifications import NotificationService

    store, client, prefix = notification_store
    rid, host, invited, _ = notification_data
    with SessionLocal() as db:
        service = NotificationService(db, store)
        first = service.create_for_reservation(rid)
        original = client.lindex(prefix + str(invited), 0)
        time.advance(minutes=5)
        second = service.create_for_reservation(rid)
    assert set(first) == {invited}
    assert second == {}
    assert client.llen(prefix + str(invited)) == 1
    assert client.exists(prefix + str(host)) == 0
    assert client.lindex(prefix + str(invited), 0) == original


def test_retention_keeps_latest_notifications(notification_store):
    from app.schemas.notifications import NotificationOut

    store, client, prefix = notification_store
    user_id = uuid4()
    ids = [uuid4() for _ in range(3)]
    for nid in ids:
        store.save(user_id, NotificationOut(
            notification_id=nid, type="reservation.created", reservation_id=uuid4(),
            title="회의", room_name="A", message="회의 안내",
            start_at="2026-10-23T01:00:00Z", end_at="2026-10-23T02:00:00Z",
            created_at="2026-10-22T01:00:00Z",
        ))
    saved = [json.loads(item) for item in client.lrange(prefix + str(user_id), 0, -1)]
    assert [item["notification_id"] for item in saved] == [str(ids[2]), str(ids[1])]


def test_concurrent_save_does_not_duplicate_notifications(notification_store):
    from app.schemas.notifications import NotificationOut

    store, client, prefix = notification_store
    uid = uuid4()
    notification = NotificationOut(
        notification_id=uuid4(), type="reservation.created", reservation_id=uuid4(),
        title="회의", room_name="A", message="회의 안내",
        start_at="2026-10-23T01:00:00Z", end_at="2026-10-23T02:00:00Z",
        created_at="2026-10-22T01:00:00Z",
    )
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: store.save(uid, notification), range(8)))
    assert sum(results) == 1
    assert client.llen(prefix + str(uid)) == 1


def test_missing_reservation_writes_no_notifications(notification_store):
    from app.services.notifications import NotificationService

    store, client, prefix = notification_store
    with SessionLocal() as db, pytest.raises(ApiError) as error:
        NotificationService(db, store).create_for_reservation(uuid4())
    assert error.value.status_code == 404
    assert list(client.scan_iter(match=prefix + "*")) == []


def test_redis_failure_is_reported_and_committed_reservation_is_preserved(notification_data):
    from app.services.notifications import NotificationService, NotificationStore

    rid, _, _, _ = notification_data
    # 사용하지 않는 로컬 포트로 실제 Redis 연결 실패를 확인한다.
    import socket

    with socket.socket() as unavailable:
        unavailable.bind(("127.0.0.1", 0))
        client = Redis(host="127.0.0.1", port=unavailable.getsockname()[1], socket_connect_timeout=0.1)
        try:
            with SessionLocal() as db, pytest.raises(ApiError) as error:
                NotificationService(db, NotificationStore(client)).create_for_reservation(rid)
            assert error.value.status_code == 503
            assert error.value.detail["code"] == "NOTIFICATION_STORE_UNAVAILABLE"
            with SessionLocal() as db:
                assert db.get(Reservation, rid) is not None
        finally:
            client.close()


@pytest.fixture
def notification_api(client, notification_store):
    from app.api.routes.notifications import get_notification_store

    store, redis, prefix = notification_store
    app.dependency_overrides[get_notification_store] = lambda: store
    try:
        yield client, store, redis, prefix
    finally:
        app.dependency_overrides.pop(get_notification_store, None)


def test_notification_list_requires_login(client):
    response = client.get("/api/notifications")
    assert response.status_code == 401


def test_notification_list_is_empty_for_a_new_user(notification_api, seed):
    client, _, _, _ = notification_api
    seed()
    assert signin(client).status_code == 200
    response = client.get("/api/notifications")
    assert response.status_code == 200
    assert response.json() == {"items": [], "retention_limit": 2}
    assert response.headers["cache-control"] == "no-store"


def test_notification_list_is_private_and_survives_relogin(notification_api, notification_data):
    from app.services.notifications import NotificationService

    client, store, redis, prefix = notification_api
    rid, host, invited, _ = notification_data
    with SessionLocal() as db:
        saved = NotificationService(db, store).create_for_reservation(rid)
    assert signin(client).status_code == 200
    for _ in range(2):
        response = client.get("/api/notifications", params={"user_id": str(invited)})
        assert response.status_code == 200
        assert response.json()["items"] == []
    assert client.post("/api/auth/logout", json={}).status_code == 204
    assert signin(client, email="invited@example.com").status_code == 200
    response = client.get("/api/notifications")
    assert [item["notification_id"] for item in response.json()["items"]] == [str(saved[invited].notification_id)]
    assert redis.llen(prefix + str(invited)) == 1
    assert redis.exists(prefix + str(host)) == 0


def test_notification_list_sorts_by_timestamp_then_id(notification_api, seed):
    from app.schemas.notifications import NotificationOut

    client, store, _, _ = notification_api
    uid = seed()
    store.retention_limit = 3
    # 서로 다른 시간대의 같은 시각과 Redis 삽입 순서를 구분한다.
    for number, created_at in [
        (3, "2026-10-22T00:00:00Z"),
        (2, "2026-10-22T09:00:00+09:00"),
        (1, "2026-10-21T23:00:00Z"),
    ]:
        store.save(uid, NotificationOut(
            notification_id=UUID(int=number), reservation_id=uuid4(),
            title="회의", room_name="A", message="참석 안내",
            start_at="2026-10-23T01:00:00Z", end_at="2026-10-23T02:00:00Z",
            created_at=created_at,
        ))
    assert signin(client).status_code == 200
    response = client.get("/api/notifications")
    assert response.status_code == 200
    assert [item["notification_id"] for item in response.json()["items"]] == [str(UUID(int=n)) for n in (3, 2, 1)]


def test_notification_list_reports_redis_failure(notification_api, seed):
    from app.api.routes.notifications import get_notification_store
    from app.services.notifications import NotificationStore

    client, _, _, _ = notification_api
    seed()
    assert signin(client).status_code == 200
    with socket.socket() as unavailable:
        unavailable.bind(("127.0.0.1", 0))
        redis = Redis(host="127.0.0.1", port=unavailable.getsockname()[1], socket_connect_timeout=0.1)
        app.dependency_overrides[get_notification_store] = lambda: NotificationStore(redis)
        try:
            response = client.get("/api/notifications")
            assert response.status_code == 503
            assert response.json()["detail"]["code"] == "NOTIFICATION_STORE_UNAVAILABLE"
        finally:
            redis.close()


def test_read_notification_survives_relogin_and_keeps_first_read_time(notification_api, notification_data, time):
    from app.services.notifications import NotificationService

    client, store, _, _ = notification_api
    rid, _, invited, _ = notification_data
    with SessionLocal() as db:
        saved = NotificationService(db, store).create_for_reservation(rid)[invited]
    assert signin(client, "invited@example.com").status_code == 200
    assert client.get("/api/notifications").json()["items"][0]["read_at"] is None
    path = f"/api/notifications/{saved.notification_id}/read"
    first = client.patch(path, json={})
    assert first.status_code == 200
    read_at = first.json()["read_at"]
    assert datetime.fromisoformat(read_at) == time.value
    time.advance(minutes=1)
    assert client.patch(path, json={}).json()["read_at"] == read_at
    assert client.post("/api/auth/logout", json={}).status_code == 204
    assert signin(client, "invited@example.com").status_code == 200
    assert client.get("/api/notifications").json()["items"][0]["read_at"] == read_at


def test_read_notification_cannot_access_another_users_notification(notification_api, notification_data):
    from app.services.notifications import NotificationService

    client, store, redis, prefix = notification_api
    rid, host, invited, _ = notification_data
    with SessionLocal() as db:
        saved = NotificationService(db, store).create_for_reservation(rid)[invited]
    path = f"/api/notifications/{saved.notification_id}/read"
    assert client.patch(path, json={}).status_code == 401
    assert signin(client).status_code == 200
    assert client.patch(path, json={"user_id": str(invited)}).status_code == 404
    assert store.list_for_user(invited)[0].read_at is None
    assert not list(redis.scan_iter(match=prefix + str(host) + "*"))


@pytest.mark.parametrize("headers,status", [
    ({"X-CSRF-Token": ""}, 403),
    ({"Origin": "https://other.example"}, 403),
    ({"Content-Type": "text/plain"}, 415),
])
def test_read_notification_checks_csrf_origin_and_json(notification_api, seed, headers, status):
    client, _, _, _ = notification_api
    seed()
    assert signin(client).status_code == 200
    assert client.patch(f"/api/notifications/{uuid4()}/read", json={}, headers=headers).status_code == status


def test_read_state_is_removed_when_notification_is_trimmed(notification_store):
    from app.schemas.notifications import NotificationOut

    store, redis, prefix = notification_store
    uid = uuid4()
    ids = [uuid4() for _ in range(3)]
    for index, nid in enumerate(ids):
        store.save(uid, NotificationOut(
            notification_id=nid, reservation_id=uuid4(), title="회의", room_name="A", message="참석 안내",
            start_at="2026-10-23T01:00:00Z", end_at="2026-10-23T02:00:00Z", created_at="2026-10-22T01:00:00Z",
        ))
        if index == 0:
            store.mark_read(uid, nid)
    with pytest.raises(ApiError) as error:
        store.mark_read(uid, ids[0])
    assert error.value.status_code == 404
    assert [item.read_at for item in store.list_for_user(uid)] == [None, None]
    hashes = [key for key in redis.scan_iter(match=prefix + "*") if redis.type(key) == "hash"]
    assert all(str(ids[0]) not in redis.hkeys(key) for key in hashes)


def test_concurrent_reads_keep_one_read_time(notification_store):
    from app.schemas.notifications import NotificationOut

    store, _, _ = notification_store
    uid, nid = uuid4(), uuid4()
    store.save(uid, NotificationOut(
        notification_id=nid, reservation_id=uuid4(), title="회의", room_name="A", message="참석 안내",
        start_at="2026-10-23T01:00:00Z", end_at="2026-10-23T02:00:00Z", created_at="2026-10-22T01:00:00Z",
    ))
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: store.mark_read(uid, nid).read_at, range(8)))
    assert len(set(results)) == 1
    assert store.list_for_user(uid)[0].read_at == results[0]
