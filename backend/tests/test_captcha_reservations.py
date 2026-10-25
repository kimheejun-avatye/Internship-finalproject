"""실제 로그인과 PostgreSQL을 거치는 예약 인증 경계."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from conftest import captcha_payload, signin
from sqlalchemy import func, select
from test_reservation_http import account as reservation_account
from test_reservation_http import payload

from app.db.session import SessionLocal
from app.models.captcha_intents import CaptchaIntent
from app.models.reservations import Reservation
from app.services import captcha

account = reservation_account


def test_browser_cannot_bypass_captcha(client, account):
    response = client.post("/api/reservations", json=payload(account[1]))
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CAPTCHA_REQUIRED"
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0


def test_prepare_keeps_login_origin_and_csrf_guards(client, account):
    response = client.post("/api/reservations/captcha", json=payload(account[1]),
                           headers={"X-CSRF-Token": "wrong"})
    assert response.status_code == 403
    response = client.post("/api/reservations/captcha", json=payload(account[1]),
                           headers={"Origin": "https://evil.example"})
    assert response.status_code == 403


@pytest.mark.parametrize("mutation", ["pending", "forged", "subject", "payload", "challenge"])
def test_rejects_unverified_or_rebound_browser_proof(client, account, captcha_provider, mutation):
    data = captcha_payload(client, payload(account[1]), captcha_provider, completed=mutation != "pending")
    if mutation == "forged":
        data["captcha"]["completion_id"] = "cmp_forged"
    elif mutation == "subject":
        captcha_provider.challenges[data["captcha"]["challenge_id"]]["subject"] = str(uuid4())
    elif mutation == "payload":
        data["title"] = "다른 예약"
    elif mutation == "challenge":
        data["captcha"]["challenge_id"] = "ch_other"
    response = client.post("/api/reservations", json=data)
    assert response.status_code == 403
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0
        assert db.get(CaptchaIntent, data["captcha"]["intent_id"]).reservation_id is None


def test_different_user_cannot_use_another_intent(client, account, seed, captcha_provider):
    data = captcha_payload(client, payload(account[1]), captcha_provider)
    seed(email="other@example.com")
    assert signin(client, email="other@example.com").status_code == 200
    assert client.post("/api/reservations", json=data).status_code == 403


def test_no_cta_needed_and_exact_retry_survives_expiry_and_new_client(client, account, captcha_provider, time):
    from fastapi.testclient import TestClient

    from app.main import app
    data = captcha_payload(client, payload(account[1]), captcha_provider)
    first = client.post("/api/reservations", json=data)
    assert first.status_code == 201
    time.advance(minutes=11)
    with TestClient(app, headers={"Origin": "http://127.0.0.1:5174"}) as restarted:
        restarted.cookies.update(client.cookies)
        restarted.headers["X-CSRF-Token"] = client.headers["X-CSRF-Token"]
        assert restarted.post("/api/reservations", json=data).json() == first.json()
    data["captcha"]["completion_id"] = "different-result"
    assert client.post("/api/reservations", json=data).status_code == 403
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 1


def test_expired_intent_requires_new_challenge(client, account, captcha_provider, time):
    data = captcha_payload(client, payload(account[1]), captcha_provider)
    time.advance(minutes=10)
    response = client.post("/api/reservations", json=data)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CAPTCHA_EXPIRED"


@pytest.mark.parametrize("failure", ["unavailable", "malformed"])
def test_provider_failure_cannot_create_booking_and_same_proof_can_retry(client, account, captcha_provider, failure):
    data = captcha_payload(client, payload(account[1]), captcha_provider)
    setattr(captcha_provider, failure, True)
    response = client.post("/api/reservations", json=data)
    assert response.status_code == (503 if failure == "unavailable" else 403)
    with SessionLocal() as db:
        assert db.get(CaptchaIntent, data["captcha"]["intent_id"]).reservation_id is None
    setattr(captcha_provider, failure, False)
    assert client.post("/api/reservations", json=data).status_code == 201


def test_booking_rollback_does_not_consume_completion(client, account, captcha_provider, monkeypatch):
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.orm import Session
    data = captcha_payload(client, payload(account[1]), captcha_provider)
    commit = Session.commit
    def fail(db):
        if any(isinstance(row, CaptchaIntent) and row.reservation_id for row in db.dirty):
            raise OperationalError("COMMIT", {}, RuntimeError("simulated commit failure"))
        return commit(db)
    monkeypatch.setattr(Session, "commit", fail)
    assert client.post("/api/reservations", json=data).status_code == 503
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0
        assert db.get(CaptchaIntent, data["captcha"]["intent_id"]).completion_id is None
    monkeypatch.setattr(Session, "commit", commit)
    assert client.post("/api/reservations", json=data).status_code == 201


def test_concurrent_same_intent_creates_exactly_one_booking(client, account, captcha_provider):
    from app.schemas.reservations import ReservationSubmitIn
    data = captcha_payload(client, payload(account[1]), captcha_provider)
    def create():
        with SessionLocal() as db:
            return captcha.reserve_with_captcha(db, account[0], ReservationSubmitIn(**data)).reservation_id
    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(lambda _: create(), range(6)))
    assert len(set(ids)) == 1
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 1


def test_completion_cannot_be_reused_across_intents_even_if_provider_returns_it(client, account, captcha_provider, monkeypatch):
    first = captcha_payload(client, payload(account[1]), captcha_provider)
    second = captcha_payload(client, payload(account[1], 3), captcha_provider)
    assert client.post("/api/reservations", json=first).status_code == 201
    second["captcha"]["completion_id"] = first["captcha"]["completion_id"]
    monkeypatch.setattr(captcha, "provider_request", lambda path, body: {"passed": True, **body})
    response = client.post("/api/reservations", json=second)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "CAPTCHA_REUSED"
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Reservation)) == 1


def test_default_origin_accepts_customer_frontend_port(client, account, captcha_provider, monkeypatch):
    from app.core.config import Settings, settings
    monkeypatch.delenv("APP_ORIGINS", raising=False)
    monkeypatch.setattr(settings, "origins", Settings().origins)
    client.headers["Origin"] = "http://127.0.0.1:5175"
    assert client.post("/api/reservations/captcha", json=payload(account[1])).status_code == 201
