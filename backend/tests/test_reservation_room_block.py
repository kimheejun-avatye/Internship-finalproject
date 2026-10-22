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

# 예약은 평일 정각 단위만 가능하므로 먼 미래의 월요일 11:00 ~ 13:00을 차단한다.
NOW = datetime.now(ZoneInfo("Asia/Seoul")).replace(second=0, microsecond=0)
MONDAY = datetime(2030, 1, 7, tzinfo=ZoneInfo("Asia/Seoul"))
BLOCK_START = MONDAY + timedelta(hours=11)
BLOCK_END = MONDAY + timedelta(hours=13)


@pytest.fixture
def setup():
    with SessionLocal() as db:
        admin = User(email="admin@example.com", name="관리자", password_hash="x", team=Team.AVATYE, role=Role.ADMIN)
        member = User(email="member@example.com", name="멤버", password_hash="x", team=Team.AVATYE, approved_at=NOW)
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


@pytest.mark.parametrize("start_hour, end_hour", [
    (10, 12),   # 앞부분이 차단과 겹침
    (12, 14),   # 뒷부분이 차단과 겹침
    (11, 12),   # 차단 안에 포함
    (10, 14),   # 차단을 감쌈
])
def test_reservation_overlapping_block_is_rejected(setup, start_hour, end_hour):
    member, room = setup

    with pytest.raises(ApiError) as error:
        create(member, room, MONDAY + timedelta(hours=start_hour), MONDAY + timedelta(hours=end_hour))

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "ROOM_BLOCKED"


@pytest.mark.parametrize("start, end", [
    (MONDAY + timedelta(hours=9), BLOCK_START),  # 차단 시작에 딱 맞춰 끝남
    (BLOCK_END, BLOCK_END + timedelta(hours=1)),  # 차단이 끝나자마자 시작
])
def test_reservation_touching_block_is_allowed(setup, start, end):
    member, room = setup

    result = create(member, room, start, end)

    assert (result.start_at, result.end_at) == (start, end)
