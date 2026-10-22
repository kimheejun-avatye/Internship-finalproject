import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url

url = os.environ.get("TEST_DATABASE_URL")
if not url or not make_url(url).database.endswith("_test"):
    raise RuntimeError(
        "Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test"
    )
os.environ["DATABASE_URL"] = url
# The team reservation tests assert the configured test DB name.
os.environ["POSTGRES_DB"] = make_url(url).database
os.environ["SECRET_KEY"] = "test-secret-only-not-for-production-1234567890"
# Tests must not inherit a developer-specific browser port from .env.
os.environ["APP_ORIGINS"] = "http://127.0.0.1:5174"
os.environ["APP_ENV"] = "development"
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import Team, User
from app.services import clock

PASSWORD = "Example123!"


@pytest.fixture(scope="session", autouse=True)
def migrated():
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def clean_db(migrated):
    with SessionLocal() as db:
        db.execute(
            text(
                "TRUNCATE rooms, users, email_verifications, email_send_log, signup_check_log, login_failures, login_locks, login_ip_requests, password_reset_verifications CASCADE"
            )
        )
        db.commit()


@pytest.fixture
def client():
    with TestClient(
        app, client=("127.0.0.1", 50000), headers={"Origin": "http://127.0.0.1:5174"}
    ) as c:
        yield c


@pytest.fixture
def seed():
    def create(email="member@example.com", approved=True, blocked=False, name="테스트", team=Team.AVATYE):
        with SessionLocal() as db:
            user = User(
                email=email,
                name=name,
                password_hash=hash_password(PASSWORD),
                team=team,
                approved_at=clock.now() if approved else None,
                blocked_at=clock.now() if blocked else None,
            )
            db.add(user)
            db.commit()
            return user.user_id

    return create


@pytest.fixture
def time(monkeypatch):
    class Time:
        value = datetime(2026, 10, 19, 0, 0, tzinfo=timezone.utc)

        def advance(self, **kwargs):
            from datetime import timedelta

            self.value += timedelta(**kwargs)

    value = Time()
    monkeypatch.setattr(clock, "now", lambda: value.value)
    return value


def signin(client, email="member@example.com", password=PASSWORD):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        client.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    return r


@pytest.fixture
def mails(monkeypatch):
    from app.services import mailer

    messages = []
    monkeypatch.setattr(
        mailer, "send_email", lambda to, subject, body: messages.append((to, body))
    )
    return messages


@pytest.fixture
def notification_store():
    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("Set TEST_REDIS_URL to run Redis integration tests")
    from uuid import uuid4

    from redis import Redis

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


@pytest.fixture(autouse=True)
def reservation_notification_storage(monkeypatch, request):
    from app.services import notifications

    if not os.environ.get("TEST_REDIS_URL"):
        # PostgreSQL만 지정한 테스트가 개발 Redis에 알림을 쓰지 않도록 한다.
        def unavailable_store():
            raise RuntimeError("Set TEST_REDIS_URL to enable reservation notifications in tests")

        monkeypatch.setattr(notifications, "get_notification_store", unavailable_store)
        return
    store, _, _ = request.getfixturevalue("notification_store")
    monkeypatch.setattr(notifications, "get_notification_store", lambda: store)
