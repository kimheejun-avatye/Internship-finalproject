from sqlalchemy import func, select

from app.core.security import verify_password
from app.db.session import SessionLocal
from app.models.rooms import Room
from app.models.users import Role, User
from scripts import seed


def test_seed_creates_qa_accounts_and_rooms():
    with SessionLocal() as db:
        assert seed.seed(db) == (5, 3)

    with SessionLocal() as db:
        admin = db.scalar(select(User).where(User.email == "qa-admin@example.com"))
        pending = db.scalar(select(User).where(User.email == "qa-pending1@example.com"))
        assert admin.role == Role.ADMIN and admin.approved_at is not None
        assert pending.approved_at is None
        assert verify_password(seed.DEV_PASSWORD, admin.password_hash)


def test_seed_twice_does_not_duplicate():
    with SessionLocal() as db:
        seed.seed(db)
    with SessionLocal() as db:
        assert seed.seed(db) == (0, 0)
        assert db.scalar(select(func.count()).select_from(User)) == 5
        assert db.scalar(select(func.count()).select_from(Room)) == 3


def test_login_with_seeded_admin(client):
    with SessionLocal() as db:
        seed.seed(db)

    response = client.post(
        "/api/auth/login", json={"email": "qa-admin@example.com", "password": seed.DEV_PASSWORD}
    )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "ADMIN"
