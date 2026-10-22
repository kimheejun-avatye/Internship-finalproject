"""예약·캘린더 조회의 동기 서비스."""

from typing import Any
from uuid import UUID
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import func, select

from sqlalchemy.orm import Session

from app.schemas.rooms import RoomOut
from app.core.exceptions import ApiError
from app.models.reservations import Reservation
from app.models.rooms import Room, RoomStatus
from app.models.reservation_attendee import ReservationAttendee
from app.models.users import User
from app.services import room_blocks
from app.schemas.reservations import (
    AvailabilityQuery,
    CalendarQuery,
    CalendarReservationResponse,
    ReservationCreateIn,
    ReservationCreateOut,
    ReservationListOut,
    ReservationOut,
    TimeSlotOut,
)


# 예약·캘린더 조회 규칙을 담당하는 서비스
class ReservationService:
    """기존 동기 Session을 주입받으며 세션을 생성하거나 종료하지 않는다.

    HTTP 연결 시 기존 get_db가 세션 수명을 관리한다.
    TODO: 공통 조회 조건을 재사용할 리포지토리가 생기면 DB 접근을 위임한다.
    """

    # 생성자: 외부에서 수명을 관리하는 동기 DB 세션을 주입받아 보관한다.
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_reservation(
        self, user_id: UUID, data: ReservationCreateIn
    ) -> ReservationCreateOut:
        """요청 전용 세션에서 예약을 생성하고 commit 또는 rollback한다.

        READ COMMITTED에서 같은 회의실의 생성 요청을 행 잠금으로 직렬화한다.
        향후 예약 수정도 중복 검사 전에 같은 회의실 잠금을 획득해야 한다.
        세션에 이 요청과 관계없는 저장 작업을 섞지 않는다.
        """
        try:
            # 잠금 대기 후 최신 상태를 확인하도록 기존 ORM 객체도 갱신한다.
            room = self.db.scalar(
                select(Room)
                .where(Room.room_id == data.room_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if room is None:
                raise ApiError(404, "ROOM_NOT_FOUND", "회의실을 찾을 수 없습니다.")
            if room.status != RoomStatus.ACTIVE:
                raise ApiError(409, "ROOM_UNAVAILABLE", "예약할 수 없는 회의실입니다.")

            # 잠금을 기다리는 동안 시작 시각이 지났을 수도 있다.
            now = datetime.now(ZoneInfo("Asia/Seoul"))
            if data.start_at < now:
                raise ApiError(400, "START_IN_PAST", "시작 시각은 과거일 수 없습니다.")
            if self.db.get(User, user_id) is None:
                raise ApiError(404, "USER_NOT_FOUND", "예약자를 찾을 수 없습니다.")

            # 관리자가 일시 차단한 시간과 조금이라도 겹치면 예약할 수 없다.
            if room_blocks.overlapping_blocks(self.db, room.room_id, data.start_at, data.end_at):
                raise ApiError(409, "ROOM_BLOCKED", "관리자가 회의실을 차단한 시간과 겹칩니다.")

            conflict = self.db.scalar(
                select(Reservation.reservation_id)
                .where(
                    Reservation.room_id == data.room_id,
                    Reservation.start_at < data.end_at,
                    Reservation.end_at > data.start_at,
                )
                .limit(1)
            )
            if conflict is not None:
                raise ApiError(409, "RESERVATION_CONFLICT", "이미 예약된 시간과 겹칩니다.")

            attendee_ids = self._validate_attendees(room, user_id, data.attendee_ids)

            reservation = Reservation(
                room_id=data.room_id,
                user_id=user_id,
                title=data.title,
                start_at=data.start_at,
                end_at=data.end_at,
                created_at=now,
            )
            self.db.add(reservation)
            self.db.flush()
            self._save_attendees(reservation.reservation_id, attendee_ids)
            # 예약과 참여자를 같은 트랜잭션으로 저장한다.
            # 응답 구성까지 성공한 뒤 저장을 확정한다.
            result = ReservationCreateOut.model_validate(reservation)
            self.db.commit()
            return result
        except Exception:
            self.db.rollback()
            raise

    # 캘린더 예약 조회: 기간 겹침·생성자·회의실 조건으로 예약과 참석 정보를 구성한다.
    def get_calendar_reservations(
        self, user_id: UUID, query: CalendarQuery
    ) -> list[CalendarReservationResponse]:
        """조회 기간·범위·회의실 조건에 맞는 캘린더 예약 목록을 반환한다.

        회의실 이름, 참석 인원수, 내 예약 여부와 내 참석 여부를 포함한다.
        """
        # 참석 인원은 참석자 테이블에서 계산하며, 참석자가 없어도 0을 반환한다.
        participant_count = (
            select(func.count())
            .select_from(ReservationAttendee)
            .where(ReservationAttendee.reservation_id == Reservation.reservation_id)
            .correlate(Reservation)
            .scalar_subquery()
        )

        # 생성자 여부와 독립적으로 로그인 사용자의 실제 참석 등록 여부를 확인한다.
        is_attending = (
            select(ReservationAttendee.user_id)
            .where(
                ReservationAttendee.reservation_id == Reservation.reservation_id,
                ReservationAttendee.user_id == user_id,
            )
            .correlate(Reservation)
            .exists()
        )

        # 기본 기간 조건에 사용자 선택 조건을 추가한다. 이 단계에서는 실행하지 않는다.
        statement = (
            select(
                Reservation,
                Room.name.label("room_name"),
                participant_count.label("participant_count"),
                is_attending.label("is_attending"),
            )
            .join(Room, Room.room_id == Reservation.room_id)
            .where(
                Reservation.start_at < query.end_at,
                Reservation.end_at > query.start_at,
            )
        )
        # 내가 참석한 회의일 경우 표시
        if query.scope == "mine":
            statement = statement.where(is_attending)
        if query.room_id is not None:
            statement = statement.where(Reservation.room_id == query.room_id)

        statement = statement.order_by(Reservation.start_at, Reservation.reservation_id)

        # 예약 외 여러 열을 함께 받으므로 scalars 대신 execute로 한 번에 조회한다.
        rows = self.db.execute(statement).all()
        return [
            CalendarReservationResponse(
                reservation_id=reservation.reservation_id,
                title=reservation.title,
                room_id=reservation.room_id,
                room_name=room_name,
                organizer_id=reservation.user_id,
                start_at=reservation.start_at,
                end_at=reservation.end_at,
                participant_count=count,
                is_mine=reservation.user_id == user_id,
                is_attending=attending,
            )
            for reservation, room_name, count, attending in rows
        ]

    # 회의실 목록 조회
    def get_calendar_rooms(self) -> list[RoomOut]:
        """캘린더 필터와 예약 페이지의 선택 항목에 사용할 회의실 정보를 조회한다.

        개별 예약 목록이 아닌 회의실 자체의 목록을 제공하는 메서드다.
        입력: 별도 조회 인자 없음. 생성자로 주입받은 DB Session을 사용한다.
        반환: 회의실 ID·이름·상태·수용 인원을 담은 list[RoomOut].
        현재는 미구현 스켈레톤이며 호출 시 NotImplementedError를 발생시킨다.

        TODO: 회의실을 일관된 순서(name, room_id)로 조회해 기존 RoomOut 구성.
        RoomOut은 room_id/name 외 status/capacity도 포함한다.
        TODO: BLOCK 회의실 표시 여부는 제품 정책 확인 후 결정한다.
        """
        # 기존 회의실 목록과 동일하게 상태로 제외하지 않고 이름·ID 순으로 제공한다.
        rooms = self.db.scalars(select(Room).order_by(Room.name, Room.room_id)).all()
        return [RoomOut.model_validate(room) for room in rooms]

    # 선택한 회의실의 오늘 남은 예약을 예약자 구분 없이 5건씩 조회한다.
    def get_my_today_reservations(
        self, user_id: UUID, room_id: UUID, page: int = 1
    ) -> ReservationListOut:
        """한국 시간 오늘과 겹치며 아직 종료되지 않은 예약을 조회한다.

        start_at < 내일 00:00, end_at > 오늘 00:00, end_at > 현재 시각을 적용한다.
        user_id는 컨트롤러에서 전달받지만 현재 조회 필터에는 사용하지 않는다.
        start_at, reservation_id 오름차순으로 정렬하며 페이지당 5건을 반환한다.
        total은 같은 조건의 전체 개수이고, 범위를 벗어난 페이지는 items=[]이다.
        """
        if page < 1:
            raise ValueError("페이지 번호는 1 이상이어야 합니다.")
        now = datetime.now(ZoneInfo("Asia/Seoul"))

        today_start = now.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0
        )
        tomorrow_start = today_start + timedelta(days=1)

        statement = select(Reservation).where(
            Reservation.room_id == room_id,
            Reservation.start_at < tomorrow_start,
            Reservation.end_at > today_start,
            Reservation.end_at > now
        )

        # 조건에 맞는 예약이 총 몇 개인지 세는 조회문
        count_statement = select(func.count()).select_from(
            statement.subquery()
        )

        # 실제 db에 실행
        total = self.db.scalar(count_statement)

        # 페이지 위치 계산
        page_size = 5
        offset = (page - 1) * page_size

        # 예약 정렬
        page_statement = (
            statement
            .order_by(Reservation.start_at, Reservation.reservation_id)
            .offset(offset)
            .limit(page_size)
        )
        reservations = self.db.scalars(page_statement).all()     # 여러 객체 가져올 때는 scalar's'

        if not reservations:
            return ReservationListOut(
                items=[],
                total=total,
                page=page,
                page_size=page_size,
            )
        # 참석 인원수 조회
        reservation_ids = [
            reservation.reservation_id
            for reservation in reservations
        ]

        attendee_statement = (
            select(
                ReservationAttendee.reservation_id,
                func.count(ReservationAttendee.user_id),
            )
            .where(
                ReservationAttendee.reservation_id.in_(reservation_ids)
            )
            .group_by(ReservationAttendee.reservation_id)
        )
        participant_counts = dict(
            self.db.execute(attendee_statement).all()   # 두 값을 함께 받아야 하기 때문에 execute 사용
        )

        # 예약 생성자의 소속 조회
        organizer_ids = [
            reservation.user_id
            for reservation in reservations
        ]
        team_statement = select(
            User.user_id,
            User.team,
        ).where(
            User.user_id.in_(organizer_ids)
        )

        teams = dict(
            self.db.execute(team_statement).all()
        )

        # 응답 객체 구성
        items = []

        for reservation in reservations:
            item = ReservationOut(
                reservation_id=reservation.reservation_id,
                room_id=reservation.room_id,
                user_id=reservation.user_id,
                title=reservation.title,
                start_at=reservation.start_at,
                end_at=reservation.end_at,
                # 해당 예약의 참석 인원수를 찾고 없으면 0
                participant_count=participant_counts.get(
                    reservation.reservation_id, 0
                ),
                team=teams[reservation.user_id],
            )
            items.append(item)

        return ReservationListOut(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )

    # 가능 시간 조회: 하루 24시간을 1시간 슬롯 24개로 나눠 예약·차단·과거 시각과 겹치는지 표시한다.
    def get_room_availability(self, query: AvailabilityQuery) -> list[TimeSlotOut]:
        """한국 시간 기준 query.date 하루를 query.slot_minutes 간격으로 나눈 슬롯 목록.

        입력: 회의실 ID, 날짜, 슬롯 길이. 반환: 시간순 list[TimeSlotOut].
        TODO: 회의실이 없으면 404 ROOM_NOT_FOUND, ACTIVE가 아니면 슬롯을 모두 불가로 처리할지 결정.
        TODO: 그 날짜와 겹치는 Reservation을 한 번에 조회한다(슬롯마다 쿼리하지 않는다).
        TODO: room_blocks.overlapping_blocks로 관리자 차단 구간을 가져와 슬롯과 대조한다.
        결정: 영업 시간 제한 없이 하루 24시간을 1시간 단위 슬롯 24개로 나눈다.
        TODO: 현재 시각 이전 슬롯은 available=False로 표시한다. 겹침 판단은 [start, end) 반열린 구간.
        TODO: create_reservation의 중복 검사 조건과 일치하는지 확인한다.
        """

        room = self.db.get(Room, query.room_id)

        if room is None:
            raise ApiError(404, "ROOM_NOT_FOUND", "회의실을 찾을 수 없습니다.")

        day_start = datetime.combine(query.date, time.min, tzinfo=ZoneInfo("Asia/Seoul"))
        day_end = day_start + timedelta(days=1)
        slot_length = timedelta(minutes=query.slot_minutes)     # 슬롯 1시간

        # ACTIVE가 아니면 조회 없이 모든 슬롯을 불가로 표시한다.
        room_active = room.status == RoomStatus.ACTIVE
        reservations = []
        blocks = []
        if room_active:
            reservations = self.db.scalars(
                select(Reservation).where(
                    Reservation.room_id == query.room_id,
                    Reservation.start_at < day_end,
                    Reservation.end_at > day_start,
                )
            ).all()
            blocks = room_blocks.overlapping_blocks(
                self.db, query.room_id, day_start, day_end
            )

        now = datetime.now(ZoneInfo("Asia/Seoul"))
        slots = []
        for i in range(24 * 60 // query.slot_minutes):
            slot_start = day_start + slot_length * i
            slot_end = slot_start + slot_length

            # 사유는 우선순위 순으로 하나만 정한다. None이면 예약 가능.
            if not room_active:
                reason = "ROOM_UNAVAILABLE"
            elif slot_start < now:
                reason = "PAST"
            elif any(r.start_at < slot_end and r.end_at > slot_start for r in reservations):
                reason = "RESERVED"
            elif any(b.start_at < slot_end and b.end_at > slot_start for b in blocks):
                reason = "BLOCKED"
            else:
                reason = None

            slots.append(
                TimeSlotOut(
                    start_at=slot_start,
                    end_at=slot_end,
                    available=reason is None,
                    reason=reason,
                )
            )
        return slots

    # 참여자·정원 검사: create_reservation의 잠금 안에서 호출한다.
    def _validate_attendees(self, room: Room, organizer_id: UUID, attendee_ids: list[UUID]) -> list[UUID]:
        """중복을 제거한 참여자 ID 목록을 반환하고 위반 시 ApiError를 발생시킨다.

        존재하지 않거나 승인 대기·차단 사용자가 섞여 있으면 404로 거부한다.
        결정: 주최자는 참석자에 자동 포함되고 정원에도 포함한다(주최자 + 참여자 수 <= capacity).
        결정: 팀은 제한하지 않는다. 다른 팀 사용자도 참여자로 지정할 수 있다.
        결정: 인원 > room.capacity 이면 409 CAPACITY_EXCEEDED 로 거부한다.
        """

        attendee_ids = list(dict.fromkeys([organizer_id, *attendee_ids]))
        valid_ids = set(self.db.scalars(
            select(User.user_id)
            .where(
                User.user_id.in_(attendee_ids),
                User.approved_at.is_not(None),
                User.blocked_at.is_(None),
            )
        ))
        if len(valid_ids) != len(attendee_ids):
            raise ApiError(404, "USER_NOT_FOUND", "초대할 수 없는 사용자가 포함되어 있습니다.")

        if room.capacity < len(attendee_ids):
            raise ApiError(409, "CAPACITY_EXCEEDED", "참석자 수가 회의실 정원을 초과합니다.")

        return attendee_ids

    # 참여자 저장: reservation_attendees 행을 추가한다.
    def _save_attendees(self, reservation_id: UUID, attendee_ids: list[UUID]) -> None:
        """검증·중복 제거된 참여자를 추가한다. commit은 호출자가 한다."""
        self.db.add_all([
            ReservationAttendee(reservation_id=reservation_id, user_id=user_id)
            for user_id in attendee_ids
        ])
