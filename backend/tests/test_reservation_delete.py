"""Reservation deletion exercises real PostgreSQL FKs, authorization and rollback."""
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, func, select, text
from sqlalchemy.exc import OperationalError
from conftest import signin
from test_reservation_http import account, payload  # noqa: F401

from app.db.session import SessionLocal
from app.models import Memo
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.users import Team


def create_with_notes(client, account, seed):
    invitee = seed("invitee@example.com", team=Team.GURU)
    response = client.post("/api/reservations", json={**payload(account[1]), "attendee_ids": [str(invitee)]})
    assert response.status_code == 201
    rid = response.json()["reservation_id"]
    # Opening the editor must not insert an empty memo.
    assert client.get(f"/api/reservations/{rid}/memo").json() is None
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Memo)) == 0
    for email in ["member@example.com", "invitee@example.com"]:
        assert signin(client, email).status_code == 200
        saved = client.put(f"/api/reservations/{rid}/memo", json={"memo": f"{email}의 개인 메모"})
        assert saved.status_code == 200
        assert saved.json()["created_at"]
        updated = client.put(f"/api/reservations/{rid}/memo", json={"memo": f"{email}의 수정한 메모"})
        assert updated.status_code == 200
        assert updated.json()["memo_id"] == saved.json()["memo_id"]
        assert updated.json()["created_at"] == saved.json()["created_at"]
        assert updated.json()["updated_at"] is not None
        assert client.get(f"/api/reservations/{rid}/memo").json()["memo"] == f"{email}의 수정한 메모"
    assert signin(client).status_code == 200
    return UUID(rid)


def counts(db, rid):
    return tuple(db.scalar(select(func.count()).select_from(model).where(model.reservation_id == rid))
                 for model in [Reservation, ReservationAttendee, Memo])


def test_creator_deletes_reservation_and_every_personal_memo_atomically(client, account, seed):
    rid = create_with_notes(client, account, seed)
    other = client.post("/api/reservations", json=payload(account[1], hour=3)).json()["reservation_id"]
    assert client.put(f"/api/reservations/{other}/memo", json={"memo": "유지할 다른 회의록"}).status_code == 200
    with SessionLocal() as db:
        assert counts(db, rid) == (1, 2, 2)
        # Inspect the actual migrated database, not just ORM declarations.
        constraints = dict(db.execute(text("""
            SELECT conrelid::regclass::text, confdeltype
            FROM pg_constraint WHERE contype = 'f' AND confrelid = 'reservations'::regclass
        """)).all())
        assert constraints["memo"] == "a"  # NO ACTION; explicit cleanup is required.
        assert constraints["reservation_attendees"] == "c"
    response = client.delete(f"/api/reservations/{rid}", headers={"Content-Type": "application/json"})
    assert response.status_code == 204 and response.content == b""
    with SessionLocal() as db:
        assert counts(db, rid) == (0, 0, 0)
        assert counts(db, UUID(other)) == (1, 1, 1)
    period = payload(account[1])
    calendar = client.get("/api/calendar/reservations", params={"start_at": period["start_at"], "end_at": period["end_at"], "scope": "all"})
    assert calendar.status_code == 200 and calendar.json() == []
    assert client.get(f"/api/reservations/{rid}/memo").status_code == 404
    assert client.put(f"/api/reservations/{rid}/memo", json={"memo": "복원 불가"}).status_code == 404
    assert client.delete(f"/api/reservations/{rid}", headers={"Content-Type": "application/json"}).status_code == 404


@pytest.mark.parametrize("who", ["attendee", "outsider", "guest"])
def test_only_creator_can_delete(client, account, seed, who):
    rid = create_with_notes(client, account, seed)
    if who == "guest":
        client.cookies.clear()
    else:
        email = "invitee@example.com" if who == "attendee" else "outsider@example.com"
        if who == "outsider":
            seed(email)
        assert signin(client, email).status_code == 200
    response = client.delete(f"/api/reservations/{rid}", headers={"Content-Type": "application/json"})
    assert response.status_code == (401 if who == "guest" else 403)
    with SessionLocal() as db:
        assert counts(db, rid) == (1, 2, 2)


@pytest.mark.parametrize("headers,status", [
    ({"X-CSRF-Token": "wrong"}, 403), ({"Origin": "https://untrusted.example"}, 403),
    ({"Content-Type": "text/plain"}, 415),
])
def test_delete_keeps_csrf_origin_and_json_checks(client, account, headers, status):
    rid = client.post("/api/reservations", json=payload(account[1])).json()["reservation_id"]
    response = client.delete(f"/api/reservations/{rid}", headers={"Content-Type": "application/json", **headers})
    assert response.status_code == status
    with SessionLocal() as db:
        assert counts(db, UUID(rid)) == (1, 1, 0)


def test_delete_failure_rolls_back_attendees_and_memos(client, account, seed):
    rid = create_with_notes(client, account, seed)
    with SessionLocal() as db:
        engine = db.get_bind()
    def fail_parent_delete(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("DELETE FROM reservations "):
            raise OperationalError("DELETE", {}, RuntimeError("simulated DB failure"))
    event.listen(engine, "before_cursor_execute", fail_parent_delete)
    try:
        response = client.delete(f"/api/reservations/{rid}", headers={"Content-Type": "application/json"})
        assert response.status_code == 503
    finally:
        event.remove(engine, "before_cursor_execute", fail_parent_delete)
    with SessionLocal() as db:
        assert counts(db, rid) == (1, 2, 2)


def test_unknown_reservation_returns_404(client, account):
    assert client.delete(f"/api/reservations/{uuid4()}", headers={"Content-Type": "application/json"}).status_code == 404


def test_concurrent_memo_save_waits_for_delete_then_returns_404(client, account):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from app.core.exceptions import ApiError
    from app.services.memo import MemoService
    from app.services.reservations import ReservationService

    rid = UUID(client.post("/api/reservations", json=payload(account[1])).json()["reservation_id"])
    waiting = Event()
    with SessionLocal() as deletion:
        deletion.scalar(select(Reservation).where(Reservation.reservation_id == rid).with_for_update())
        engine = deletion.get_bind()
        def observe(conn, cursor, statement, parameters, context, executemany):
            if "FROM reservations" in statement and "FOR UPDATE" in statement:
                waiting.set()
        def save():
            with SessionLocal() as writing:
                return MemoService(writing).save_my_memo(rid, account[0], "동시 저장")
        event.listen(engine, "before_cursor_execute", observe)
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(save)
                try:
                    assert waiting.wait(3)
                    assert not future.done()
                    ReservationService(deletion).delete_reservation(rid, account[0])
                finally:
                    deletion.rollback()
                with pytest.raises(ApiError) as caught:
                    future.result(timeout=3)
                assert caught.value.detail["code"] == "RESERVATION_NOT_FOUND"
        finally:
            event.remove(engine, "before_cursor_execute", observe)
    with SessionLocal() as db:
        assert counts(db, rid) == (0, 0, 0)
