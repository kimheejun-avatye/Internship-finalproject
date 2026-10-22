"""참석자 기준 캘린더 조회를 실제 로그인과 PostgreSQL로 검증한다."""

from datetime import datetime, timedelta
from uuid import UUID

import pytest
from conftest import signin

from app.db.session import SessionLocal
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room
from app.models.users import Team

PATH = "/api/calendar/reservations"


@pytest.fixture
def calendar_data(client, seed, time):
    me = seed()
    other = seed("calendar-other@example.com", team=Team.GURU)
    assert signin(client).status_code == 200
    start = datetime.fromisoformat("2026-10-23T00:00:00+09:00")

    with SessionLocal() as db:
        room_a = Room(name="캘린더 A", capacity=6)
        room_b = Room(name="캘린더 B", capacity=6)
        db.add_all([room_a, room_b])
        db.flush()
        cases = [
            (1, room_a, me, 10, [me]),
            (2, room_a, other, 11, [me, other]),
            (3, room_a, other, 12, [other]),
            (4, room_b, other, 13, [me, other]),
            (5, room_a, other, 24, [me, other]),
        ]
        for number, room, organizer, hour, attendees in cases:
            db.add(Reservation(
                reservation_id=UUID(int=number), room_id=room.room_id,
                user_id=organizer, title=f"회의 {number}", participants=99,
                start_at=start + timedelta(hours=hour),
                end_at=start + timedelta(hours=hour + 1), created_at=start,
            ))
            db.flush()
            db.add_all([
                ReservationAttendee(reservation_id=UUID(int=number), user_id=user_id)
                for user_id in attendees
            ])
        db.commit()
        return {
            "room_a": str(room_a.room_id), "room_b": str(room_b.room_id),
            "period": {
                "start_at": "2026-10-23T00:00:00+09:00",
                "end_at": "2026-10-24T00:00:00+09:00",
            },
        }


def test_mine_includes_created_and_invited_meetings(client, calendar_data):
    response = client.get(PATH, params={
        **calendar_data["period"], "scope": "mine", "room_id": calendar_data["room_a"],
    })

    assert response.status_code == 200
    items = response.json()
    assert [item["reservation_id"] for item in items] == [str(UUID(int=1)), str(UUID(int=2))]
    assert [item["is_mine"] for item in items] == [True, False]
    assert [item["is_attending"] for item in items] == [True, True]
    assert [item["participant_count"] for item in items] == [1, 2]


def test_all_includes_meetings_without_my_attendance(client, calendar_data):
    response = client.get(PATH, params={
        **calendar_data["period"], "scope": "all", "room_id": calendar_data["room_a"],
    })

    assert response.status_code == 200
    items = response.json()
    assert [item["reservation_id"] for item in items] == [
        str(UUID(int=1)), str(UUID(int=2)), str(UUID(int=3)),
    ]
    assert [item["is_attending"] for item in items] == [True, True, False]


@pytest.mark.parametrize("room,expected", [("room_b", [4]), (None, [1, 2, 4])])
def test_mine_preserves_period_and_room_filters(client, calendar_data, room, expected):
    params = {**calendar_data["period"], "scope": "mine"}
    if room is not None:
        params["room_id"] = calendar_data[room]
    response = client.get(PATH, params=params)

    assert response.status_code == 200
    assert [item["reservation_id"] for item in response.json()] == [
        str(UUID(int=number)) for number in expected
    ]
