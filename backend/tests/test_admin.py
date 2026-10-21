import uuid
from datetime import datetime, timedelta, timezone

import pytest
from conftest import PASSWORD, signin
from sqlalchemy import select

from app.api.admin_auth import current_admin
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models.room_blocks import RoomBlock
from app.models.rooms import Room, RoomStatus
from app.models.users import Role, Team, User
from app.services import admin as admin_service
from app.services import room_blocks

NOW = datetime(2026, 10, 19, 15, 0, tzinfo=timezone.utc)


def make_user(email, role=Role.MEMBER, approved=True, blocked=False):
    with SessionLocal() as db:
        user = User(
            email=email,
            name=email.split("@")[0],
            password_hash="hash",
            team=Team.AVATYE,
            role=role,
            approved_at=NOW - timedelta(days=1) if approved else None,
            blocked_at=NOW - timedelta(hours=1) if blocked else None,
        )
        db.add(user)
        db.commit()
        return user


def make_room(name="A회의실"):
    with SessionLocal() as db:
        room = Room(name=name, status=RoomStatus.ACTIVE, capacity=6)
        db.add(room)
        db.commit()
        return room


def get_user(user_id):
    with SessionLocal() as db:
        return db.get(User, user_id)


@pytest.fixture
def admin_user(monkeypatch):
    monkeypatch.setattr(admin_service, "_now", lambda: NOW)
    user = make_user("admin@example.com", role=Role.ADMIN)
    app.dependency_overrides[current_admin] = lambda: user
    yield user
    app.dependency_overrides.pop(current_admin, None)


def test_admin_api_requires_login(client):
    response = client.get("/api/admin/users")

    assert response.status_code == 401


def test_member_cannot_use_admin_api(client, seed):
    seed("member@example.com")
    assert signin(client, "member@example.com").status_code == 200

    response = client.get("/api/admin/users")

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "ADMIN_REQUIRED"


def test_logged_in_admin_can_block_member(client, seed):
    member_id = seed("member@example.com")
    with SessionLocal() as db:
        db.add(User(
            email="admin@example.com",
            name="관리자",
            password_hash=hash_password(PASSWORD),
            team=Team.AVATYE,
            role=Role.ADMIN,
            approved_at=NOW,
        ))
        db.commit()
    assert signin(client, "admin@example.com").status_code == 200

    # signin 이 CSRF 토큰 헤더를 붙여 두므로 POST 도 통과한다
    response = client.post(f"/api/admin/users/{member_id}/block")

    assert response.status_code == 200
    assert response.json()["status"] == "BLOCKED"


def test_admin_post_without_csrf_is_rejected(client, seed):
    member_id = seed("member@example.com")
    with SessionLocal() as db:
        db.add(User(
            email="admin@example.com",
            name="관리자",
            password_hash=hash_password(PASSWORD),
            team=Team.AVATYE,
            role=Role.ADMIN,
            approved_at=NOW,
        ))
        db.commit()
    signin(client, "admin@example.com")
    del client.headers["X-CSRF-Token"]

    response = client.post(f"/api/admin/users/{member_id}/block")

    assert response.status_code == 403
    assert get_user(member_id).blocked_at is None


def test_list_users_shows_status(client, admin_user):
    make_user("pending@example.com", approved=False)
    make_user("blocked@example.com", blocked=True)

    response = client.get("/api/admin/users")

    assert response.status_code == 200
    statuses = {u["email"]: u["status"] for u in response.json()}
    assert statuses == {
        "admin@example.com": "ACTIVE",
        "pending@example.com": "PENDING",
        "blocked@example.com": "BLOCKED",
    }


def test_approve_pending_user(client, admin_user):
    user = make_user("pending@example.com", approved=False)

    response = client.post(f"/api/admin/users/{user.user_id}/approve")

    assert response.status_code == 200
    assert response.json()["status"] == "ACTIVE"
    assert get_user(user.user_id).approved_at == NOW


def test_approve_rejects_already_approved_user(client, admin_user):
    user = make_user("member@example.com")

    response = client.post(f"/api/admin/users/{user.user_id}/approve")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "USER_NOT_PENDING"


def test_reject_deletes_pending_user(client, admin_user):
    user = make_user("pending@example.com", approved=False)

    response = client.post(f"/api/admin/users/{user.user_id}/reject")

    assert response.status_code == 204
    assert get_user(user.user_id) is None


def test_reject_keeps_approved_user(client, admin_user):
    user = make_user("member@example.com")

    response = client.post(f"/api/admin/users/{user.user_id}/reject")

    assert response.status_code == 409
    assert get_user(user.user_id) is not None


def test_block_member(client, admin_user):
    user = make_user("member@example.com")

    response = client.post(f"/api/admin/users/{user.user_id}/block")

    assert response.status_code == 200
    assert response.json()["status"] == "BLOCKED"
    assert get_user(user.user_id).blocked_at == NOW


def test_cannot_block_admin(client, admin_user):
    other = make_user("admin2@example.com", role=Role.ADMIN)

    response = client.post(f"/api/admin/users/{other.user_id}/block")

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CANNOT_BLOCK_ADMIN"
    assert get_user(other.user_id).blocked_at is None


def test_block_already_blocked_member(client, admin_user):
    user = make_user("blocked@example.com", blocked=True)

    response = client.post(f"/api/admin/users/{user.user_id}/block")

    assert response.status_code == 409


def test_unknown_user_returns_404(client, admin_user):
    response = client.post(f"/api/admin/users/{uuid.uuid4()}/block")

    assert response.status_code == 404


def test_block_room_for_configured_minutes(client, admin_user):
    room = make_room()

    response = client.post(f"/api/admin/rooms/{room.room_id}/block")

    assert response.status_code == 200
    assert response.json()["blocked_until"] == "2026-10-19T16:00:00Z"
    with SessionLocal() as db:
        block = db.scalars(select(RoomBlock)).one()
    assert (block.start_at, block.end_at) == (NOW, NOW + timedelta(hours=1))
    assert block.blocked_by == admin_user.user_id


def test_block_room_twice_is_conflict(client, admin_user):
    room = make_room()
    client.post(f"/api/admin/rooms/{room.room_id}/block")

    response = client.post(f"/api/admin/rooms/{room.room_id}/block")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "ROOM_ALREADY_BLOCKED"


def test_block_unknown_room_returns_404(client, admin_user):
    response = client.post(f"/api/admin/rooms/{uuid.uuid4()}/block")

    assert response.status_code == 404


def test_list_rooms_shows_blocked_until(client, admin_user):
    blocked = make_room("A회의실")
    make_room("B회의실")
    client.post(f"/api/admin/rooms/{blocked.room_id}/block")

    response = client.get("/api/admin/rooms")

    assert response.status_code == 200
    until = {r["name"]: r["blocked_until"] for r in response.json()}
    assert until == {"A회의실": "2026-10-19T16:00:00Z", "B회의실": None}


def test_block_ends_after_configured_minutes(client, admin_user, monkeypatch):
    room = make_room()
    client.post(f"/api/admin/rooms/{room.room_id}/block")
    monkeypatch.setattr(admin_service, "_now", lambda: NOW + timedelta(hours=1))

    response = client.get("/api/admin/rooms")

    assert response.json()[0]["blocked_until"] is None


def test_overlapping_blocks_cover_only_overlapping_reservations(client, admin_user):
    # 15:00 차단 → 16:00 까지. 15:30~16:30 예약은 앞 30분을 쓸 수 없다
    room = make_room()
    client.post(f"/api/admin/rooms/{room.room_id}/block")

    with SessionLocal() as db:
        overlapping = room_blocks.overlapping_blocks(
            db, room.room_id, NOW + timedelta(minutes=30), NOW + timedelta(minutes=90)
        )
        after = room_blocks.overlapping_blocks(
            db, room.room_id, NOW + timedelta(hours=1), NOW + timedelta(hours=2)
        )

    assert [(b.start_at, b.end_at) for b in overlapping] == [(NOW, NOW + timedelta(hours=1))]
    assert after == []
