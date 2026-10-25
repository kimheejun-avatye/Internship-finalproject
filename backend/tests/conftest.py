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
    def create(email="member@example.com", approved=True, blocked=False):
        with SessionLocal() as db:
            user = User(
                email=email,
                name="테스트",
                password_hash=hash_password(PASSWORD),
                team=Team.AVATYE,
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
        value = datetime(2026, 10, 18, 0, 0, tzinfo=timezone.utc)

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
def captcha_provider(monkeypatch):
    """HTTP 경계만 대체하며 발급 내용과 완료 여부는 독립적으로 확인한다."""
    import httpx
    from uuid import uuid4
    from datetime import timedelta
    from types import SimpleNamespace
    from app.core.config import settings
    from app.services import captcha

    state = SimpleNamespace(challenges={}, calls=[], unavailable=False, malformed=False)
    monkeypatch.setattr(settings, "captchavatye_service_key", "test-service-key-with-at-least-32-characters")
    real_client = httpx.Client

    def handler(request):
        import json
        body = json.loads(request.content)
        state.calls.append((request.url.path, body))
        if state.unavailable:
            raise httpx.ConnectError("provider unavailable", request=request)
        if request.url.path == "/internal/challenges":
            challenge_id = "ch_" + uuid4().hex
            state.challenges[challenge_id] = dict(subject=body["subject"], completed=False)
            return httpx.Response(201, json={"challengeId": challenge_id,
                "creative": {"creativeId": "bmw-m3-v1"},
                "expiresAt": (clock.now() + timedelta(minutes=10)).isoformat()})
        if state.malformed:
            return httpx.Response(200, json={"passed": True})
        record = state.challenges.get(body["challengeId"])
        if (not record or not record["completed"] or record["subject"] != body["subject"]
                or body["completionId"] != "cmp_" + body["challengeId"]):
            return httpx.Response(403, json={"detail": {"code": "CAPTCHA_INVALID"}})
        return httpx.Response(200, json={"passed": True, **body})

    monkeypatch.setattr(captcha.httpx, "Client", lambda **kwargs:
        real_client(transport=httpx.MockTransport(handler), **kwargs))
    return state


def captcha_payload(client, body, provider, completed=True):
    result = client.post("/api/reservations/captcha", json=body)
    assert result.status_code == 201, result.text
    issued = result.json()
    challenge_id = issued["challenge"]["challengeId"]
    provider.challenges[challenge_id]["completed"] = completed
    return {**body, "captcha": {"intent_id": issued["intent_id"], "challenge_id": challenge_id,
                               "completion_id": "cmp_" + challenge_id}}
