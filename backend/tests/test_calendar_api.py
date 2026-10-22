"""DB 연결 없이 캘린더 HTTP 계약과 인증 의존성 연결을 검증한다."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies import authenticated
from app.api.routes.reservation import get_reservation_controller, router
from app.core.exceptions import ApiError
from app.schemas.reservations import CalendarReservationResponse
from app.schemas.rooms import RoomOut


@pytest.fixture
def calendar_api():
    user_id, room_id = uuid4(), uuid4()
    calls = []

    class Controller:
        def get_calendar_reservations(self, query, user):
            calls.append((query, user))
            return [CalendarReservationResponse(
                reservation_id=uuid4(), title="회의", room_id=room_id,
                room_name="A", organizer_id=user_id, start_at=query.start_at,
                end_at=query.end_at, participant_count=0,
                is_mine=True, is_attending=False,
            )]

        def get_calendar_rooms(self, user):
            return [RoomOut(room_id=room_id, name="A", status="ACTIVE", capacity=6)]

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[authenticated] = lambda: (
        SimpleNamespace(user_id=user_id), None,
    )
    app.dependency_overrides[get_reservation_controller] = Controller
    with TestClient(app) as client:
        yield SimpleNamespace(
            app=app, client=client, calls=calls, user_id=user_id, room_id=room_id,
            params=dict(start_at="2026-10-19T00:00:00+09:00",
                        end_at="2026-10-26T00:00:00+09:00", scope="mine",
                        room_id=str(room_id)),
        )


def test_calendar_query_and_response_contract(calendar_api):
    api = calendar_api
    response = api.client.get("/api/calendar/reservations", params=api.params)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()[0]["is_mine"] is True
    assert response.json()[0]["is_attending"] is False
    query, user = api.calls[0]
    assert query.scope == "mine"
    assert query.room_id == api.room_id
    assert user.user_id == api.user_id


@pytest.mark.parametrize("changes", [
    {"end_at": "2026-10-19T00:00:00+09:00"},
    {"start_at": "2026-10-19T00:00:00"},
    {"scope": "bad"},
    {"room_id": "bad"},
])
def test_invalid_calendar_query_returns_422(calendar_api, changes):
    api = calendar_api
    response = api.client.get(
        "/api/calendar/reservations", params={**api.params, **changes},
    )
    assert response.status_code == 422
    assert api.calls == []


def test_calendar_rooms_response(calendar_api):
    response = calendar_api.client.get("/api/calendar/rooms")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()[0]["room_id"] == str(calendar_api.room_id)


@pytest.mark.parametrize("path", ["/api/calendar/reservations", "/api/calendar/rooms"])
def test_calendar_requires_authentication(calendar_api, path):
    def denied():
        raise ApiError(401, "SESSION_REQUIRED", "로그인이 필요합니다.")

    calendar_api.app.dependency_overrides[authenticated] = denied
    response = calendar_api.client.get(path, params=calendar_api.params)
    assert response.status_code == 401
    assert calendar_api.calls == []
