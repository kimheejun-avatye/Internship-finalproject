from app.core.security import verify_password
from app.db.session import SessionLocal
from app.models.users import Role, Team, User
from scripts import create_admin


def test_creates_approved_admin():
    with SessionLocal() as db:
        create_admin.create(db, "avatye-admin@gmail.com", "Admin123!", "관리자", Team.AVATYE)

    with SessionLocal() as db:
        user = create_admin.find_active(db, "avatye-admin@gmail.com")
        assert user.role == Role.ADMIN
        assert user.approved_at is not None
        assert verify_password("Admin123!", user.password_hash)


def test_promotes_existing_member_without_changing_password():
    with SessionLocal() as db:
        db.add(User(email="member@example.com", name="멤버", password_hash="old", team=Team.GURU))
        db.commit()

    with SessionLocal() as db:
        create_admin.promote(db, create_admin.find_active(db, "member@example.com"))

    with SessionLocal() as db:
        user = create_admin.find_active(db, "member@example.com")
        assert (user.role, user.password_hash) == (Role.ADMIN, "old")
        assert user.approved_at is not None


def test_password_rules_match_signup():
    assert create_admin.password_error("short1!") is not None
    assert create_admin.password_error("NoDigits!!") is not None
    assert create_admin.password_error("has space1!") is not None
    assert create_admin.password_error("Admin123!") is None
