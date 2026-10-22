"""Real login cookies and CSRF protect reservation HTTP endpoints."""

from datetime import datetime, timedelta
from uuid import UUID, uuid4

import pytest
from conftest import signin
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room
from app.models.users import Team, User
from app.services import clock, reservations


@pytest.fixture
def account(client, seed, time, monkeypatch):
    user_id = seed()
    assert signin(client).status_code == 200

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = clock.now()
            return value.astimezone(tz) if tz else value.replace(tzinfo=None)

    monkeypatch.setattr(reservations, "datetime", FrozenDatetime)
    with SessionLocal() as db:
        room = Room(name="인증 통합 테스트 회의실", capacity=6)
        db.add(room)
        db.commit()
        return user_id, room.room_id


def payload(room_id, hour=1):
    return {"room_id": str(room_id), "title": "인증된 예약",
            "start_at": (clock.now() + timedelta(hours=hour)).isoformat(),
            "end_at": (clock.now() + timedelta(hours=hour + 1)).isoformat()}


def test_login_create_and_list_with_real_cookie(client, account):
    user_id, room_id = account
    rooms = client.get("/api/rooms")
    assert rooms.status_code == 200
    assert rooms.json()[0]["room_id"] == str(room_id)
    response = client.post("/api/reservations", json=payload(room_id))
    assert response.status_code == 201
    created = response.json()
    assert created["user_id"] == str(user_id)
    listing = client.get(f"/api/rooms/{room_id}/reservations")
    assert listing.status_code == 200
    data = listing.json()
    assert (data["total"], data["page"], data["page_size"]) == (1, 1, 5)
    assert data["items"][0]["reservation_id"] == created["reservation_id"]
    with SessionLocal() as db:
        assert db.get(Reservation, UUID(created["reservation_id"])).user_id == user_id


@pytest.mark.parametrize("organizer_team,invitee_team", [(Team.AVATYE, Team.GURU), (Team.GURU, Team.AVATYE)])
def test_cross_team_invitation_is_saved_and_shown_in_invitee_calendar(client, account, seed, organizer_team, invitee_team):
    organizer_id, room_id = account
    with SessionLocal() as db:
        db.get(User, organizer_id).team = organizer_team
        db.commit()
    invitee_id = seed("invitee@example.com", team=invitee_team)
    colleague_id = seed("colleague@example.com", team=organizer_team)
    request = payload(room_id)
    response = client.post("/api/reservations", json={
        **request,
        "attendee_ids": [str(invitee_id), str(colleague_id), str(invitee_id), str(organizer_id)],
    })
    assert response.status_code == 201
    reservation_id = UUID(response.json()["reservation_id"])
    with SessionLocal() as db:
        assert set(db.scalars(select(ReservationAttendee.user_id).where(
            ReservationAttendee.reservation_id == reservation_id,
        ))) == {organizer_id, invitee_id, colleague_id}

    period = {"start_at": request["start_at"], "end_at": request["end_at"], "scope": "mine"}
    for email, is_organizer in [("member@example.com", True), ("invitee@example.com", False)]:
        assert signin(client, email).status_code == 200
        calendar = client.get("/api/calendar/reservations", params=period)
        assert calendar.status_code == 200
        (meeting,) = calendar.json()
        assert meeting["reservation_id"] == str(reservation_id)
        assert meeting["participant_count"] == 3
        assert meeting["is_attending"] is True
        assert meeting["is_mine"] is is_organizer


@pytest.mark.parametrize("state", ["blocked", "pending", "missing", "over_capacity"])
def test_invalid_attendees_or_capacity_do_not_leave_a_reservation(client, account, seed, state):
    if state == "over_capacity":
        attendee_ids = [seed(f"attendee-{i}@example.com", team=Team.GURU) for i in range(6)]
    else:
        attendee_ids = [uuid4() if state == "missing" else seed(
            "invalid@example.com", team=Team.GURU,
            approved=state != "pending", blocked=state == "blocked",
        )]
    response = client.post("/api/reservations", json={
        **payload(account[1]), "attendee_ids": [str(user_id) for user_id in attendee_ids],
    })
    assert response.status_code == (409 if state == "over_capacity" else 404)
    assert response.json()["detail"]["code"] == ("CAPACITY_EXCEEDED" if state == "over_capacity" else "USER_NOT_FOUND")
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0
        assert db.scalar(select(func.count()).select_from(ReservationAttendee)) == 0


@pytest.mark.parametrize("method,path", [("GET", "/api/rooms"),
    ("GET", f"/api/rooms/{uuid4()}/reservations"), ("POST", "/api/reservations")])
def test_guest_cannot_use_reservation_endpoints(client, method, path):
    response = client.request(method, path, **({"json": payload(uuid4())} if method == "POST" else {}))
    assert response.status_code == 401


@pytest.mark.parametrize("headers,status", [
    ({"X-CSRF-Token": ""}, 403), ({"X-CSRF-Token": "wrong"}, 403),
    ({"Origin": "https://untrusted.example"}, 403),
    ({"Content-Type": "text/plain"}, 415),
])
def test_mutations_require_csrf_origin_and_json(client, account, headers, status):
    response = client.post("/api/reservations", json=payload(account[1]), headers=headers)
    assert response.status_code == status
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0


@pytest.mark.parametrize("state,status", [("expired", 401), ("logged_out", 401), ("blocked", 403)])
def test_session_state_is_checked_for_reservations(client, account, time, state, status):
    user_id, room_id = account
    if state == "expired":
        time.advance(minutes=31)
    elif state == "logged_out":
        token = client.cookies.get("session")
        assert client.post("/api/auth/logout", json={}).status_code == 204
        client.cookies.set("session", token)
    else:
        with SessionLocal() as db:
            db.get(User, user_id).blocked_at = clock.now()
            db.commit()
    response = client.post("/api/reservations", json=payload(room_id))
    assert response.status_code == status
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0


def test_http_conflict_validation_and_pagination(client, account):
    _, room_id = account
    for hour in range(1, 8):
        assert client.post("/api/reservations", json=payload(room_id, hour)).status_code == 201
    assert client.post("/api/reservations", json=payload(room_id)).status_code == 409
    assert client.post("/api/reservations", json={**payload(room_id), "user_id": str(uuid4())}).status_code == 422
    assert client.get(f"/api/rooms/{room_id}/reservations?page=0").status_code == 422
    assert client.get(f"/api/rooms/{uuid4()}/reservations").status_code == 404
    result = client.get(f"/api/rooms/{room_id}/reservations?page=2").json()
    assert (result["total"], result["page"], len(result["items"])) == (7, 2, 2)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 7


def test_api_database_errors_do_not_expose_details(client, account, monkeypatch):
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.orm import Session

    def fail(*args, **kwargs):
        raise OperationalError("secret statement", {}, RuntimeError("private database error"))

    monkeypatch.setattr(Session, "scalar", fail)
    response = client.get("/api/rooms")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SERVICE_UNAVAILABLE"
    assert "secret statement" not in response.text


@pytest.mark.parametrize("failure_stage", ["read", "commit"])
def test_optional_activity_failure_does_not_hide_committed_creation(client, account, monkeypatch, failure_stage):
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.orm import Session
    from app.services import sessions

    original_current = sessions.current
    original_commit = Session.commit
    calls = 0

    def current(db, token):
        nonlocal calls
        calls += 1
        if calls == 2 and failure_stage == "read":
            raise OperationalError("SELECT activity", {}, RuntimeError("test optional activity failure"))
        identity = original_current(db, token)
        if calls == 2 and failure_stage == "commit":
            db.info["fail_activity_commit"] = True
        return identity

    def commit(db):
        if db.info.pop("fail_activity_commit", False):
            raise OperationalError("COMMIT activity", {}, RuntimeError("test optional activity failure"))
        return original_commit(db)

    monkeypatch.setattr(sessions, "current", current)
    monkeypatch.setattr(Session, "commit", commit)
    response = client.post("/api/reservations", json=payload(account[1]),
                           headers={"X-Session-Activity": "user"})
    assert response.status_code == 201
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 1
        assert db.get(Reservation, UUID(response.json()["reservation_id"])) is not None
