"""실제 PostgreSQL과 별도 Redis 키로 알림 저장을 검증한다."""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from redis import Redis

from app.core.exceptions import ApiError
from app.db.session import SessionLocal
from app.models.chat_memo import Memo
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room


@pytest.fixture
def notification_store():
    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("Set TEST_REDIS_URL to run Redis integration tests")
    from app.services.notifications import NotificationStore

    client = Redis.from_url(url, decode_responses=True)
    prefix = f"test:notifications:{uuid4()}:"
    store = NotificationStore(client, key_prefix=prefix, retention_limit=2)
    try:
        yield store, client, prefix
    finally:
        keys = list(client.scan_iter(match=prefix + "*"))
        if keys:
            client.delete(*keys)
        client.close()


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
    assert set(result) == {host, invited}
    for uid in (host, invited):
        saved = json.loads(client.lindex(prefix + str(uid), 0))
        assert saved["reservation_id"] == str(rid)
        assert saved["type"] == "reservation.created"
        assert saved["title"] == "기획 회의"
        assert saved["room_name"] == "회의실 A"
        assert datetime.fromisoformat(saved["start_at"]) == datetime(2026, 10, 23, 1, tzinfo=timezone.utc)
        assert datetime.fromisoformat(saved["end_at"]) == datetime(2026, 10, 23, 2, tzinfo=timezone.utc)
        assert all(text in saved["message"] for text in ("기획 회의", "회의실 A", "10:00", "11:00"))
        assert "비공개 메모" not in json.dumps(saved, ensure_ascii=False)
    assert result[host].notification_id != result[invited].notification_id
    assert client.exists(prefix + str(unrelated)) == 0


def test_repeated_generation_keeps_original_notification(notification_store, notification_data, time):
    from app.services.notifications import NotificationService

    store, client, prefix = notification_store
    rid, host, invited, _ = notification_data
    with SessionLocal() as db:
        service = NotificationService(db, store)
        first = service.create_for_reservation(rid)
        original = client.lindex(prefix + str(host), 0)
        time.advance(minutes=5)
        second = service.create_for_reservation(rid)
    assert set(first) == {host, invited}
    assert second == {}
    for uid in (host, invited):
        assert client.llen(prefix + str(uid)) == 1
    assert client.lindex(prefix + str(host), 0) == original


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
