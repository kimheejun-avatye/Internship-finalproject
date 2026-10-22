"""실제 로그인과 DB를 사용해 일정 공유 조회와 채팅 전송을 검증한다."""

from datetime import datetime, timedelta
from uuid import UUID

import pytest
from conftest import signin

from app.db.session import SessionLocal
from app.models.chat_memo import Memo
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room

DAY_PATH = "/api/calendar/share-text"
SINGLE_PATH = "/api/reservations/00000000-0000-0000-0000-000000000001/share-text"


@pytest.fixture
def share_data(client, seed, time):
    time.value = datetime.fromisoformat("2026-10-19T18:30:00+00:00")
    me = seed()
    other = seed("share-other@example.com", name="동료")
    assert signin(client).status_code == 200
    day = datetime.fromisoformat("2026-10-20T00:00:00+09:00")
    with SessionLocal() as db:
        room_a = Room(name="회의실 A", capacity=6)
        room_b = Room(name="회의실 B", capacity=6)
        db.add_all([room_a, room_b])
        db.flush()
        cases = [
            (2, "초대 회의", 10, 11, room_a, other, [me, other]),
            (1, "내 회의", 9, 10, room_a, me, [me]),
            (3, "다른 회의", 11, 12, room_a, other, [other]),
            (4, "자정 통과 회의", -1, 1, room_b, me, [me]),
            (5, "다음 날 회의", 24, 25, room_a, me, [me]),
            (6, "이미 끝난 회의", -1, 0, room_a, me, [me]),
        ]
        for number, title, start, end, room, organizer, attendees in cases:
            db.add(Reservation(
                reservation_id=UUID(int=number), room_id=room.room_id,
                user_id=organizer, title=title,
                start_at=day + timedelta(hours=start),
                end_at=day + timedelta(hours=end),
                created_at=day - timedelta(days=2),
            ))
            db.flush()
            db.add_all([
                ReservationAttendee(reservation_id=UUID(int=number), user_id=user)
                for user in attendees
            ])
        db.add(Memo(reservation_id=UUID(int=1), user_id=me, memo="비공개 개인 메모"))
        db.commit()
        return {"other": str(other), "room": room_a.room_id}


def test_single_share_returns_meeting_information_without_private_memo(client, share_data):
    response = client.get(SINGLE_PATH)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["reservation_ids"] == [str(UUID(int=1))]
    assert body["count"] == 1
    for value in ["내 회의", "회의실 A", "2026-10-20", "09:00", "10:00"]:
        assert value in body["text"]
    assert "비공개 개인 메모" not in body["text"]


@pytest.mark.parametrize("params", [{}, {"date": "2026-10-20"}])
def test_day_share_uses_seoul_date_attendance_and_overlap_boundaries(client, share_data, params):
    response = client.get(DAY_PATH, params=params)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["date"] == "2026-10-20"
    assert body["reservation_ids"] == [str(UUID(int=n)) for n in [4, 1, 2]]
    assert body["count"] == 3
    for value in ["2026-10-19", "23:00", "2026-10-20", "01:00", "초대 회의"]:
        assert value in body["text"]
    assert "다른 회의" not in body["text"]
    assert "비공개 개인 메모" not in body["text"]


def test_empty_day_returns_empty_text_and_zero_count(client, share_data):
    response = client.get(DAY_PATH, params={"date": "2026-10-22"})
    assert response.status_code == 200
    assert response.json() == {
        "date": "2026-10-22", "reservation_ids": [], "count": 0, "text": "",
    }


def test_day_share_uses_logged_in_user_instead_of_query_user_id(client, share_data):
    assert signin(client, email="share-other@example.com").status_code == 200
    response = client.get(DAY_PATH, params={"date": "2026-10-20", "user_id": str(UUID(int=1))})
    assert response.status_code == 200
    assert response.json()["reservation_ids"] == [str(UUID(int=2)), str(UUID(int=3))]


@pytest.mark.parametrize("path", [SINGLE_PATH, DAY_PATH])
def test_share_text_can_be_stored_and_read_through_existing_chat_api(client, share_data, path):
    shared = client.get(path)
    assert shared.status_code == 200
    message = shared.json()["text"]
    opened = client.post("/api/chat/rooms/direct", json={"target_user_id": share_data["other"]})
    assert opened.status_code == 201
    room_id = opened.json()["chat_room_id"]
    sent = client.post(f"/api/chat/rooms/{room_id}/messages", json={"message": message})
    assert sent.status_code == 201
    assert sent.json()["message"] == message
    history = client.get(f"/api/chat/rooms/{room_id}/messages")
    assert history.status_code == 200
    assert history.json()["items"][0]["message"] == message


def test_unknown_reservation_returns_404(client, share_data):
    response = client.get(f"/api/reservations/{UUID(int=99)}/share-text")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "RESERVATION_NOT_FOUND"


@pytest.mark.parametrize("path", [SINGLE_PATH, DAY_PATH])
def test_share_requires_login(client, path):
    response = client.get(path)
    assert response.status_code == 401


@pytest.mark.parametrize("value", ["not-a-date", "2026-13-01", "9999-12-31"])
def test_invalid_or_unrepresentable_date_returns_422(client, share_data, value):
    response = client.get(DAY_PATH, params={"date": value})
    assert response.status_code == 422


@pytest.mark.parametrize("path", [SINGLE_PATH, DAY_PATH])
def test_share_rejects_text_exceeding_chat_message_limit(client, share_data, path):
    with SessionLocal() as db:
        db.get(Room, share_data["room"]).name = "가" * 2001
        db.commit()
    response = client.get(path)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "SHARE_TEXT_TOO_LONG"
