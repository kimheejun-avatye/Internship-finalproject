"""예약·캘린더 조회와 참석자 리마인더의 동기 서비스 스켈레톤."""

from typing import Any
from uuid import UUID
from datetime import datetime, timedelta
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
    CalendarQuery,
    CalendarReservationResponse,
    ReservationCreateIn,
    ReservationCreateOut,
    ReservationListOut,
    ReservationOut,
)


# 예약·캘린더 조회 규칙과 참석자별 Slack 리마인더 처리를 담당하는 서비스
class ReservationService:
    """기존 동기 Session을 주입받으며 세션을 생성하거나 종료하지 않는다.

    HTTP 연결 시 기존 get_db가 세션 수명을 관리한다. 향후 cron 실행 코드도
    기존 SessionLocal 컨텍스트로 세션을 관리해야 한다.
    TODO: 공통 조회 조건을 재사용할 리포지토리가 생기면 DB 접근을 위임한다.
    현재 저장소에 리포지토리 및 Slack 클라이언트 추상화는 없다.
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
        if query.scope == "mine":
            statement = statement.where(Reservation.user_id == user_id)
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

    # 리마인더 동기화: 예약 일정·참석자 변경에 맞춰 참석자별 알림과 예정 시각을 갱신한다.
    def sync_reservation_reminders(self, reservation_id: UUID) -> None:
        """예약 생성·일정 변경·참석자 변경 이후 참석자별 알림 작업 동기화.

        TODO: ReservationAttendee의 (reservation_id, user_id) 복합 PK를 기준으로
        생성/갱신한다. 별도 reservation_attendee_id는 없다. 생성자도 실제 참석자로
        등록된 경우에만 수신자다. 참석자별 복합 FK와 UNIQUE(최대 한 건)를 준수한다.
        TODO: 원본 Reservation.start_at의 10분 전을 scheduled_at으로 설정한다.
        meeting_start_at, attempt_count, next_attempt_at은 저장하지 않는다.
        TODO: 일정 변경 시 미발송 대기 작업의 예정 시각 갱신. PROCESSING 작업과의
        경합, FAILED 작업 처리 정책을 확인하되 자동 재시도는 하지 않는다.
        TODO: 참석자 제거·예약 취소/삭제 시 CANCELLED 전환과 FK CASCADE에 따른
        삭제 처리 정책 확인. 이미 SENT인 알림의 일정 변경 후 재발송 여부는 미정.
        TODO: 이미 지난 발송 예정 시각의 처리 정책 확인. 실제 저장은 후속 구현.
        """
        raise NotImplementedError

    # dispatch_due_reminders: 발송 시각이 된 참석자별 Slack DM 알림을 한 번 시도하고 결과 기록
    # 향후 cron에서 호출하며, 실패하거나 처리 중인 작업은 자동 재시도하지 않는다.
    def dispatch_due_reminders(self) -> None:
        """향후 cron 실행 코드가 호출한다. 페이지 접속·작업 큐와 무관하다.

        TODO: scheduled_at <= 현재 시각인 PENDING만 조회하고 원자적으로 선점해
        PROCESSING 전환 및 claimed_at 기록. 중복 cron 실행에도 선점은 한 번만.
        TODO: 선점 상태의 영속화와 외부 발송 전후 트랜잭션 경계를 설계한다.
        TODO: 실제 참석자와 예약 상태를 확인하고 시작 시각은 Reservation.start_at 참조.
        TODO: User에 Slack 계정 연결이 없으므로 연동 방식과 클라이언트 의존성 확정.
        참석자의 개인 DM 대상(slack_channel_id)을 확인하고 시작 10분 전 알림 전송.
        TODO: 한 번만 발송 시도. 성공 시 SENT/sent_at, 실패 시 FAILED/last_error 기록.
        FAILED 및 PROCESSING 자동 재시도 금지. SDK 자동 재시도도 비활성화 필요.
        TODO: 서버 중단으로 남은 PROCESSING 작업의 운영상 처리 정책 확인.
        TODO: API 타임아웃 시 실제 전달 여부가 불명확하므로 정확히 한 번 전달을
        보장한다고 가정하지 않는다. 불명확한 결과의 기록·운영 정책 확인.
        """
        raise NotImplementedError
