"""예약 생성과 트랜잭션, 실제 PostgreSQL 잠금 경합을 검증한다."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from queue import Queue
from threading import Event, Lock
from time import monotonic, sleep
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError
from sqlalchemy import event, func, select, text
from sqlalchemy.exc import OperationalError

from app.api.routes.reservation import ReservationController
from app.core.exceptions import ApiError
from app.db.session import SessionLocal, engine
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room, RoomStatus
from app.models.users import Team, User
from app.schemas.reservations import AvailabilityQuery, BusyUsersQuery, ReservationCreateIn, ReservationCreateOut
from app.services import reservations as reservation_module
from app.services.reservations import ReservationService


@pytest.fixture
def now(monkeypatch):
    fixed = datetime(2026, 10, 19, 12, tzinfo=ZoneInfo("Asia/Seoul"))  # 월요일

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)

    monkeypatch.setattr(reservation_module, "datetime", FrozenDatetime)
    return fixed


@pytest.fixture
def db():
    with SessionLocal() as session:
        assert os.environ["POSTGRES_DB"].endswith("_test")
        assert session.scalar(text("SELECT current_database()")) == os.environ["POSTGRES_DB"]
        yield session
        session.rollback()


@pytest.fixture
def sample(db, now):
    user = User(email="creator@example.com", name="예약자", password_hash="unused", team=Team.AVATYE, approved_at=now)
    room = Room(name="생성 테스트 A회의실", capacity=6)
    other_room = Room(name="생성 테스트 B회의실", capacity=6)
    blocked_room = Room(name="차단 회의실", status=RoomStatus.BLOCK, capacity=6)
    db.add_all([user, room, other_room, blocked_room])
    db.commit()
    return SimpleNamespace(user=user, room=room, other_room=other_room, blocked_room=blocked_room)


def request_data(sample, now, **changes):
    values = dict(room_id=sample.room.room_id, title="  팀 회의  ",
                  start_at=now + timedelta(hours=1), end_at=now + timedelta(hours=2))
    values.update(changes)
    return ReservationCreateIn(**values)


def test_controller_creates_and_commits_reservation(db, sample, now):
    data = request_data(sample, now)
    result = ReservationController(ReservationService(db)).create_reservation(data, sample.user)

    assert isinstance(result, ReservationCreateOut)
    assert result.room_id == sample.room.room_id
    assert result.user_id == sample.user.user_id
    assert result.title == "팀 회의"
    assert (result.start_at, result.end_at) == (data.start_at, data.end_at)
    assert result.created_at == now
    # 다른 DB 세션에서도 보여야 저장이 확정된 것이다.
    with SessionLocal() as observer:
        saved = observer.get(Reservation, result.reservation_id)
        assert saved is not None
        assert (saved.title, saved.room_id, saved.user_id) == (result.title, result.room_id, result.user_id)
        assert list(observer.scalars(select(ReservationAttendee.user_id))) == [sample.user.user_id]
    assert result.model_dump(mode="json")["reservation_id"] == str(result.reservation_id)


def test_organizer_in_attendee_ids_is_saved_once(db, sample, now):
    # 요청 참여자에 주최자가 들어 있어도 중복 없이 한 번만 저장된다.
    data = request_data(sample, now, attendee_ids=[sample.user.user_id, sample.user.user_id])
    ReservationController(ReservationService(db)).create_reservation(data, sample.user)

    with SessionLocal() as observer:
        assert observer.scalars(select(ReservationAttendee.user_id)).all() == [sample.user.user_id]


def make_users(db, count, now, **fields):
    # 승인된 일반 사용자를 만든다. approved_at/blocked_at은 fields로 바꿀 수 있다.
    fields = {"approved_at": now, **fields}
    users = [User(email=f"member{uuid4().hex}@example.com", name="참여자", password_hash="unused",
                  team=Team.AVATYE, **fields) for _ in range(count)]
    db.add_all(users)
    db.commit()
    return users


def test_attendees_are_saved_with_organizer(db, sample, now):
    members = make_users(db, 2, now)
    data = request_data(sample, now, attendee_ids=[m.user_id for m in members])
    result = ReservationService(db).create_reservation(sample.user.user_id, data)

    saved = db.scalars(select(ReservationAttendee.user_id).where(
        ReservationAttendee.reservation_id == result.reservation_id)).all()
    assert set(saved) == {sample.user.user_id, *(m.user_id for m in members)}
    assert len(saved) == 3


@pytest.mark.parametrize("others, rejected", [(5, False), (6, True)])
def test_capacity_counts_organizer(db, sample, now, others, rejected):
    # 정원이 6이므로 주최자 + 참여자 5명은 통과하고, 참여자 6명(총 7명)은 거부한다.
    members = make_users(db, others, now)
    data = request_data(sample, now, attendee_ids=[m.user_id for m in members])
    service = ReservationService(db)
    if rejected:
        with pytest.raises(ApiError) as caught:
            service.create_reservation(sample.user.user_id, data)
        assert caught.value.status_code == 409
        assert caught.value.detail["code"] == "CAPACITY_EXCEEDED"
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0
        assert db.scalar(select(func.count()).select_from(ReservationAttendee)) == 0
    else:
        service.create_reservation(sample.user.user_id, data)
        assert db.scalar(select(func.count()).select_from(ReservationAttendee)) == others + 1


@pytest.mark.parametrize("problem", ["missing", "pending", "blocked"])
def test_invalid_attendee_is_rejected_and_reported(db, sample, now, problem):
    if problem == "missing":
        invalid_id = uuid4()
    else:
        fields = {"approved_at": None} if problem == "pending" else {"blocked_at": now}
        invalid_id = make_users(db, 1, now, **fields)[0].user_id
    valid = make_users(db, 1, now)[0]
    data = request_data(sample, now, attendee_ids=[valid.user_id, invalid_id])

    with pytest.raises(ApiError) as caught:
        ReservationService(db).create_reservation(sample.user.user_id, data)
    assert caught.value.status_code == 404
    assert caught.value.detail["code"] == "USER_NOT_FOUND"
    assert caught.value.detail["message"] == "초대할 수 없는 사용자가 포함되어 있습니다."
    assert str(valid.user_id) not in caught.value.detail["message"]
    assert db.scalar(select(func.count()).select_from(Reservation)) == 0
    assert db.scalar(select(func.count()).select_from(ReservationAttendee)) == 0


@pytest.mark.parametrize("changes", [
    {"title": ""}, {"title": " \t\n "}, {"room_id": "not-a-uuid"},
    {"start_at": "2026-10-19T13:00:00"}, {"end_at": "2026-10-19T14:00:00"},
    {"end_at": "2026-10-19T13:00:00+09:00"},
    {"end_at": "2026-10-19T12:30:00+09:00"}, {"user_id": str(uuid4())},
])
def test_create_input_rejects_invalid_values(sample, now, changes):
    with pytest.raises(ValidationError):
        request_data(sample, now, **changes)


def test_create_input_requires_title(sample, now):
    with pytest.raises(ValidationError):
        ReservationCreateIn(room_id=sample.room.room_id, start_at=now, end_at=now + timedelta(hours=1))


@pytest.mark.parametrize("start_hours,end_hours", [(-1, 1), (-2, -1)])
def test_past_start_is_rejected(db, sample, now, start_hours, end_hours):
    data = request_data(sample, now, start_at=now + timedelta(hours=start_hours),
                        end_at=now + timedelta(hours=end_hours))
    with pytest.raises(ApiError) as caught:
        ReservationService(db).create_reservation(sample.user.user_id, data)
    assert caught.value.status_code == 400
    assert caught.value.detail["code"] == "START_IN_PAST"
    assert db.scalar(select(func.count()).select_from(Reservation)) == 0


@pytest.mark.parametrize("problem,status,code", [
    ("missing_room", 404, "ROOM_NOT_FOUND"),
    ("blocked_room", 409, "ROOM_UNAVAILABLE"),
    ("missing_user", 404, "USER_NOT_FOUND"),
])
def test_creation_business_errors(db, sample, now, problem, status, code):
    room_id = (uuid4() if problem == "missing_room" else
               sample.blocked_room.room_id if problem == "blocked_room" else sample.room.room_id)
    user_id = uuid4() if problem == "missing_user" else sample.user.user_id
    with pytest.raises(ApiError) as caught:
        ReservationService(db).create_reservation(user_id, request_data(sample, now, room_id=room_id))
    assert caught.value.status_code == status
    assert caught.value.detail["code"] == code
    assert db.scalar(select(func.count()).select_from(Reservation)) == 0


@pytest.mark.parametrize("start_hours,end_hours,conflict", [
    (1, 2, False), (3, 4, False), (1, 4, True), (1, 3, True),
    (2, 4, True), (2, 3, True), (4, 5, False),
])
def test_overlap_and_adjacent_time_ranges(db, sample, now, start_hours, end_hours, conflict):
    original = Reservation(room_id=sample.room.room_id, user_id=sample.user.user_id,
                           title="기존 예약", start_at=now + timedelta(hours=2),
                           end_at=now + timedelta(hours=3), created_at=now)
    db.add(original)
    db.commit()
    data = request_data(sample, now, start_at=now + timedelta(hours=start_hours),
                        end_at=now + timedelta(hours=end_hours))
    if conflict:
        with pytest.raises(ApiError) as caught:
            ReservationService(db).create_reservation(sample.user.user_id, data)
        assert caught.value.status_code == 409
        assert caught.value.detail["code"] == "RESERVATION_CONFLICT"
    else:
        ReservationService(db).create_reservation(sample.user.user_id, data)
    assert db.scalar(select(func.count()).select_from(Reservation)) == (1 if conflict else 2)
    assert db.get(Reservation, original.reservation_id).title == "기존 예약"


def test_same_time_in_another_room_is_allowed_for_different_people(db, sample, now):
    other = make_users(db, 1, now)[0]
    service = ReservationService(db)
    first = service.create_reservation(sample.user.user_id, request_data(sample, now))
    second = service.create_reservation(other.user_id,
                                       request_data(sample, now, room_id=sample.other_room.room_id))
    assert first.reservation_id != second.reservation_id
    assert db.scalar(select(func.count()).select_from(Reservation)) == 2


def test_timezone_offsets_are_compared_as_instants(db, sample, now):
    service = ReservationService(db)
    service.create_reservation(sample.user.user_id, request_data(sample, now))
    utc_start = (now + timedelta(hours=1)).astimezone(timezone.utc)
    data = request_data(sample, now, start_at=utc_start, end_at=utc_start + timedelta(hours=1))
    with pytest.raises(ApiError) as caught:
        service.create_reservation(sample.user.user_id, data)
    assert caught.value.detail["code"] == "RESERVATION_CONFLICT"


@pytest.mark.parametrize("failure_stage", ["flush", "attendees", "response", "commit"])
def test_failed_creation_rolls_back_and_session_is_reusable(db, sample, now, monkeypatch, failure_stage):
    data = request_data(sample, now)
    with monkeypatch.context() as patch:
        if failure_stage in ("flush", "attendees"):
            original_flush = db.flush

            def fail_after_insert(*args, **kwargs):
                model = Reservation if failure_stage == "flush" else ReservationAttendee
                inserting = any(isinstance(row, model) for row in db.new)
                original_flush(*args, **kwargs)
                if inserting:
                    raise OperationalError("INSERT reservations", {}, RuntimeError("test failure"))

            patch.setattr(db, "flush", fail_after_insert)
        elif failure_stage == "response":
            def fail_response(*args, **kwargs):
                raise ValueError("test response failure")
            patch.setattr(ReservationCreateOut, "model_validate", fail_response)
        else:
            def fail_commit():
                raise OperationalError("COMMIT", {}, RuntimeError("test failure"))
            patch.setattr(db, "commit", fail_commit)
        with pytest.raises((OperationalError, ValueError)):
            ReservationService(db).create_reservation(sample.user.user_id, data)
    with SessionLocal() as observer:
        assert observer.scalar(select(func.count()).select_from(Reservation)) == 0
        assert observer.scalar(select(func.count()).select_from(ReservationAttendee)) == 0
    result = ReservationService(db).create_reservation(sample.user.user_id, data)
    assert db.get(Reservation, result.reservation_id) is not None


def test_overlapping_concurrent_requests_create_only_one_row(sample, now):
    first_locked, release_first = Event(), Event()
    pids = Queue()
    data = request_data(sample, now)
    user_id = sample.user.user_id

    def worker(first):
        with SessionLocal() as session:
            pid = session.scalar(text("SELECT pg_backend_pid()"))
            pids.put((first, pid))
            if first:
                def pause_after_room_lock(conn, cursor, statement, parameters, context, executemany):
                    if "FOR UPDATE" in statement:
                        first_locked.set()
                        if not release_first.wait(8):
                            raise RuntimeError("test room-lock wait timed out")
                event.listen(session.connection(), "after_cursor_execute", pause_after_room_lock)
            try:
                result = ReservationController(ReservationService(session)).create_reservation(
                    data, session.get(User, user_id))
                return "created", result.reservation_id
            except ApiError as error:
                return error.detail["code"], None

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(worker, True)
        try:
            assert first_locked.wait(5), "first request did not lock the room"
            second = pool.submit(worker, False)
            ids = dict([pids.get(timeout=5), pids.get(timeout=5)])
            with engine.connect() as observer:
                deadline = monotonic() + 5
                while monotonic() < deadline:
                    blockers = observer.scalar(text("SELECT pg_blocking_pids(:pid)"), {"pid": ids[False]})
                    if ids[True] in blockers:
                        break
                    sleep(0.01)
                else:
                    pytest.fail("second request never waited for the first room lock")
        finally:
            release_first.set()
        assert first.result(timeout=5)[0] == "created"
        assert second.result(timeout=5)[0] == "RESERVATION_CONFLICT"
    with SessionLocal() as observer:
        assert observer.scalar(select(func.count()).select_from(Reservation)) == 1


# ---- 예약 규칙: 1시간 단위, 최대 4시간, 평일 시작, 제목 32자 ----

@pytest.mark.parametrize("changes", [
    {"start_at": "2026-10-19T13:30:00+09:00", "end_at": "2026-10-19T14:00:00+09:00"},  # 시작이 정각이 아님
    {"start_at": "2026-10-19T13:00:00+09:00", "end_at": "2026-10-19T14:15:00+09:00"},  # 종료가 정각이 아님
    {"start_at": "2026-10-19T13:00:00+09:00", "end_at": "2026-10-19T18:00:00+09:00"},  # 5시간
    {"start_at": "2026-10-24T10:00:00+09:00", "end_at": "2026-10-24T11:00:00+09:00"},  # 토요일 시작
    {"start_at": "2026-10-25T10:00:00+09:00", "end_at": "2026-10-25T11:00:00+09:00"},  # 일요일 시작
    {"title": "가" * 33}, {"title": " " + "가" * 33 + " "},
])
def test_reservation_rules_reject_invalid_input(sample, now, changes):
    with pytest.raises(ValidationError):
        request_data(sample, now, **changes)


@pytest.mark.parametrize("changes", [
    {"start_at": "2026-10-19T13:00:00+09:00", "end_at": "2026-10-19T17:00:00+09:00"},  # 정확히 4시간
    {"start_at": "2026-10-23T22:00:00+09:00", "end_at": "2026-10-24T01:00:00+09:00"},  # 금요일 시작, 토요일 종료
    {"start_at": "2026-10-19T04:00:00Z", "end_at": "2026-10-19T05:00:00Z"},  # UTC 표기여도 한국 시간 13시면 정각
    {"title": "가" * 32}, {"title": " " + "가" * 32 + " "},
])
def test_reservation_rules_accept_boundary_input(sample, now, changes):
    request_data(sample, now, **changes)


def test_utc_start_is_judged_by_korean_time(sample, now):
    # 2026-10-19T15:00Z 는 한국 시간 화요일 00:00 이다. 한국 시간 기준 정각·평일이므로 통과한다.
    request_data(sample, now, start_at="2026-10-19T15:00:00Z", end_at="2026-10-19T16:00:00Z")
    # 2026-10-23T15:00Z 는 한국 시간 토요일 00:00 이다. UTC로는 금요일이지만 거부된다.
    with pytest.raises(ValidationError):
        request_data(sample, now, start_at="2026-10-23T15:00:00Z", end_at="2026-10-23T16:00:00Z")


def test_capacity_is_checked_before_querying_users(db, sample, now):
    # 정원(6)보다 많은 존재하지 않는 참여자: 사용자 조회까지 가면 404, 먼저 정원을 보면 409.
    data = request_data(sample, now, attendee_ids=[uuid4() for _ in range(6)])
    with pytest.raises(ApiError) as caught:
        ReservationService(db).create_reservation(sample.user.user_id, data)
    assert (caught.value.status_code, caught.value.detail["code"]) == (409, "CAPACITY_EXCEEDED")


@pytest.mark.parametrize("offset_days,allowed", [(0, True), (365, True), (-1, False), (366, False)])
def test_availability_date_range(db, sample, now, offset_days, allowed):
    day = now.date() + timedelta(days=offset_days)
    query = AvailabilityQuery(room_id=sample.room.room_id, date=day)
    if allowed:
        assert len(ReservationService(db).get_room_availability(query, sample.user.user_id)) == 24
        return
    with pytest.raises(ApiError) as caught:
        ReservationService(db).get_room_availability(query, sample.user.user_id)
    assert (caught.value.status_code, caught.value.detail["code"]) == (422, "INVALID_DATE")


def test_availability_far_future_date_is_not_a_server_error(db, sample, now):
    query = AvailabilityQuery(room_id=sample.room.room_id, date="9999-12-31")
    with pytest.raises(ApiError) as caught:
        ReservationService(db).get_room_availability(query, sample.user.user_id)
    assert caught.value.status_code == 422


# ---- 같은 시간대 중복 참석 방지: 주최자·참여자 모두 겹치는 다른 회의가 있으면 거부 ----

def _conflict(db, user_id, data):
    with pytest.raises(ApiError) as caught:
        ReservationService(db).create_reservation(user_id, data)
    assert (caught.value.status_code, caught.value.detail["code"]) == (409, "ATTENDEE_CONFLICT")


def test_organizer_cannot_host_two_meetings_at_the_same_time(db, sample, now):
    service = ReservationService(db)
    service.create_reservation(sample.user.user_id, request_data(sample, now))
    _conflict(db, sample.user.user_id, request_data(sample, now, room_id=sample.other_room.room_id))
    assert db.scalar(select(func.count()).select_from(Reservation)) == 1
    assert db.scalar(select(func.count()).select_from(ReservationAttendee)) == 1


def test_back_to_back_meetings_in_different_rooms_are_allowed(db, sample, now):
    service = ReservationService(db)
    service.create_reservation(sample.user.user_id, request_data(sample, now))
    service.create_reservation(sample.user.user_id, request_data(
        sample, now, room_id=sample.other_room.room_id,
        start_at=now + timedelta(hours=2), end_at=now + timedelta(hours=3)))
    assert db.scalar(select(func.count()).select_from(Reservation)) == 2


def test_busy_invitee_is_rejected_and_nothing_is_saved(db, sample, now):
    member, other = make_users(db, 2, now)
    service = ReservationService(db)
    service.create_reservation(sample.user.user_id, request_data(sample, now, attendee_ids=[member.user_id]))
    # member는 이미 같은 시간 회의의 참석자이므로 다른 방 회의에 초대할 수 없다.
    _conflict(db, other.user_id, request_data(sample, now, room_id=sample.other_room.room_id,
                                              attendee_ids=[member.user_id]))
    assert db.scalar(select(func.count()).select_from(Reservation)) == 1
    assert db.scalar(select(func.count()).select_from(ReservationAttendee)) == 2


def test_organizer_who_is_an_invitee_elsewhere_is_rejected(db, sample, now):
    member = make_users(db, 1, now)[0]
    service = ReservationService(db)
    service.create_reservation(sample.user.user_id, request_data(sample, now, attendee_ids=[member.user_id]))
    _conflict(db, member.user_id, request_data(sample, now, room_id=sample.other_room.room_id))


def test_legacy_reservation_without_attendee_rows_still_counts(db, sample, now):
    # 참석자 저장 기능 이전에 만든 예약은 참석자 행이 없다. 예약자(user_id)로도 겹침을 본다.
    db.add(Reservation(room_id=sample.room.room_id, user_id=sample.user.user_id, title="예전 예약",
                       start_at=now + timedelta(hours=1), end_at=now + timedelta(hours=2), created_at=now))
    db.commit()
    _conflict(db, sample.user.user_id, request_data(sample, now, room_id=sample.other_room.room_id))


def test_concurrent_requests_for_same_person_in_different_rooms_create_only_one(sample, now, monkeypatch):
    validated, release = Event(), Event()
    claim, claimed = Lock(), []
    pids = Queue()
    original = ReservationService._validate_attendees

    def pause_first(self, room, organizer_id, attendee_ids):
        result = original(self, room, organizer_id, attendee_ids)  # 두 번째 요청은 여기서 사용자 행 잠금을 기다린다.
        with claim:
            first = not claimed
            claimed.append(True)
        if first:
            validated.set()
            if not release.wait(8):
                raise RuntimeError("test wait timed out")
        return result

    monkeypatch.setattr(ReservationService, "_validate_attendees", pause_first)
    user_id = sample.user.user_id

    def worker(label, room_id):
        with SessionLocal() as session:
            pids.put((label, session.scalar(text("SELECT pg_backend_pid()"))))
            try:
                ReservationController(ReservationService(session)).create_reservation(
                    request_data(sample, now, room_id=room_id), session.get(User, user_id))
                return "created"
            except ApiError as error:
                return error.detail["code"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(worker, "first", sample.room.room_id)
        try:
            assert validated.wait(5), "first request did not finish validation"
            second = pool.submit(worker, "second", sample.other_room.room_id)
            ids = dict([pids.get(timeout=5), pids.get(timeout=5)])
            with engine.connect() as observer:
                deadline = monotonic() + 5
                while monotonic() < deadline:
                    blockers = observer.scalar(text("SELECT pg_blocking_pids(:pid)"), {"pid": ids["second"]})
                    if ids["first"] in blockers:
                        break
                    sleep(0.01)
                else:
                    pytest.fail("second request never waited for the first request's user lock")
        finally:
            release.set()
        assert first.result(timeout=8) == "created"
        assert second.result(timeout=8) == "ATTENDEE_CONFLICT"
    with SessionLocal() as observer:
        assert observer.scalar(select(func.count()).select_from(Reservation)) == 1


# ---- 가능 시간에 내 일정 반영, 시간대별 일정 있는 사람 조회 ----

def _slots(db, room, user_id, now):
    query = AvailabilityQuery(room_id=room.room_id, date=now.date())
    return {s.start_at.astimezone(now.tzinfo).hour: s for s in ReservationService(db).get_room_availability(query, user_id)}


def test_availability_marks_my_other_meetings_as_unavailable(db, sample, now):
    # 내가 A회의실 13~14시를 주최 중이면, 비어 있는 B회의실 13시도 나에게는 불가(MY_MEETING)다.
    ReservationService(db).create_reservation(sample.user.user_id, request_data(sample, now))
    slots = _slots(db, sample.other_room, sample.user.user_id, now)
    assert (slots[13].available, slots[13].reason) == (False, "MY_MEETING")
    assert slots[12].available and slots[14].available  # 인접 시간은 가능


def test_availability_marks_meetings_i_attend_but_not_for_others(db, sample, now):
    member, outsider = make_users(db, 2, now)
    ReservationService(db).create_reservation(sample.user.user_id, request_data(sample, now, attendee_ids=[member.user_id]))
    assert _slots(db, sample.other_room, member.user_id, now)[13].reason == "MY_MEETING"
    assert _slots(db, sample.other_room, outsider.user_id, now)[13].available


def test_availability_reason_for_same_room_stays_reserved(db, sample, now):
    ReservationService(db).create_reservation(sample.user.user_id, request_data(sample, now))
    assert _slots(db, sample.room, sample.user.user_id, now)[13].reason == "RESERVED"


def test_busy_users_lists_organizers_and_attendees_in_the_range(db, sample, now):
    member = make_users(db, 1, now)[0]
    ReservationService(db).create_reservation(sample.user.user_id, request_data(sample, now, attendee_ids=[member.user_id]))
    inside = BusyUsersQuery(start_at=now + timedelta(hours=1), end_at=now + timedelta(hours=2))
    assert set(ReservationService(db).get_busy_user_ids(inside).user_ids) == {sample.user.user_id, member.user_id}
    # 정각에 끝나는/시작하는 이웃 시간은 겹치지 않는다.
    for start, end in ((0, 1), (2, 3)):
        adjacent = BusyUsersQuery(start_at=now + timedelta(hours=start), end_at=now + timedelta(hours=end))
        assert ReservationService(db).get_busy_user_ids(adjacent).user_ids == []


@pytest.mark.parametrize("hours", [0, -1, 5])
def test_busy_users_query_rejects_invalid_period(now, hours):
    with pytest.raises(ValidationError):
        BusyUsersQuery(start_at=now, end_at=now + timedelta(hours=hours))
