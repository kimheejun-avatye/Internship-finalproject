"""관리자가 회의실을 일시 차단하면 그 시간과 겹치는 새 예약을 막는다."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.core.exceptions import ApiError
from app.db.session import SessionLocal
from app.models.room_blocks import RoomBlock
from app.models.rooms import Room
from app.models.users import Role, Team, User
from app.schemas.reservations import ReservationCreateIn
from app.services.reservations import ReservationService

# 차단 구간: 지금부터 1시간 뒤 ~ 2시간 뒤
NOW = datetime.now(ZoneInfo("Asia/Seoul")).replace(second=0, microsecond=0)
BLOCK_START = NOW + timedelta(hours=1)
BLOCK_END = NOW + timedelta(hours=2)


@pytest.fixture
def setup():
    with SessionLocal() as db:
        admin = User(email="admin@example.com", name="관리자", password_hash="x", team=Team.AVATYE, role=Role.ADMIN)
        member = User(email="member@example.com", name="멤버", password_hash="x", team=Team.AVATYE)
        room = Room(name="A회의실", capacity=6)
        db.add_all([admin, member, room])
        db.flush()
        db.add(RoomBlock(room_id=room.room_id, blocked_by=admin.user_id, start_at=BLOCK_START, end_at=BLOCK_END))
        db.commit()
        return member, room


def create(member, room, start, end):
    with SessionLocal() as db:
        data = ReservationCreateIn(room_id=room.room_id, title="회의", start_at=start, end_at=end)
        return ReservationService(db).create_reservation(member.user_id, data)


@pytest.mark.parametrize("start_minutes, end_minutes", [
    (30, 90),    # 앞부분이 차단과 겹침
    (90, 150),   # 뒷부분이 차단과 겹침
    (70, 80),    # 차단 안에 포함
    (30, 180),   # 차단을 감쌈
])
def test_reservation_overlapping_block_is_rejected(setup, start_minutes, end_minutes):
    member, room = setup

    with pytest.raises(ApiError) as error:
        create(member, room, NOW + timedelta(minutes=start_minutes), NOW + timedelta(minutes=end_minutes))

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "ROOM_BLOCKED"


@pytest.mark.parametrize("start, end", [
    (NOW + timedelta(minutes=10), BLOCK_START),  # 차단 시작에 딱 맞춰 끝남
    (BLOCK_END, BLOCK_END + timedelta(hours=1)),  # 차단이 끝나자마자 시작
])
def test_reservation_touching_block_is_allowed(setup, start, end):
    member, room = setup

    result = create(member, room, start, end)

    assert (result.start_at, result.end_at) == (start, end)
