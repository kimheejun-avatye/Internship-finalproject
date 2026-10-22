"""예약 컨트롤러와 로그인 인증이 필요한 예약 HTTP API."""

from datetime import date as date_type
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.dependencies import authenticated
from app.core.exceptions import ApiError
from app.db.session import get_db
from app.models.rooms import Room
from app.models.users import User
from app.schemas.reservations import (
    AvailabilityQuery,
    BusyUsersOut,
    BusyUsersQuery,
    CalendarQuery,
    CalendarReservationResponse,
    ReservationCreateIn,
    ReservationCreateOut,
    ReservationListOut,
    ReservationListQuery,
    ReservationShareOut,
    TimeSlotOut,
)
from app.schemas.rooms import RoomOut
from app.services.notifications import notify_reservation_created
from app.services.reservations import ReservationService
from app.services.rooms import list_rooms


# 예약·캘린더의 요청과 인증 사용자 정보를 받아 서비스에 전달하는 컨트롤러
class ReservationController:
    """HTTP 계층에서 확인한 User와 요청 DTO를 서비스에 전달한다."""

    # 생성자: 예약 조회 업무를 위임할 서비스 객체를 외부에서 주입받는다.
    def __init__(self, service: ReservationService) -> None:
        self.service = service

    def create_reservation(
        self, data: ReservationCreateIn, current_user: User
    ) -> ReservationCreateOut:
        """외부에서 전달받은 사용자를 예약자로 지정해 생성을 요청한다."""
        return self.service.create_reservation(
            user_id=current_user.user_id,
            data=data,
        )

    # 가능 시간 조회: 인증된 사용자에게 날짜·회의실별 슬롯을 제공한다.
    def get_room_availability(
        self, query: AvailabilityQuery, current_user: User
    ) -> list[TimeSlotOut]:
        """GET /rooms/{room_id}/availability. 계산은 서비스에 위임한다."""
        return self.service.get_room_availability(query, current_user.user_id)

    # 예약 일정 공유: 예약자가 참석자에게 채팅으로 보낸다.
    def share_reservation(self, reservation_id: UUID, current_user: User) -> ReservationShareOut:
        return self.service.share_reservation(reservation_id, current_user)

    # 시간대별 일정 있는 사람 조회: 참석자 선택 화면에서 선택 불가 표시에 쓴다.
    def get_busy_users(self, query: BusyUsersQuery, current_user: User) -> BusyUsersOut:
        return self.service.get_busy_user_ids(query)

    # 캘린더 예약 조회: 조회 기간·필터와 인증 사용자 ID를 서비스에 전달한다.
    def get_calendar_reservations(
        self, query: CalendarQuery, current_user: User
    ) -> list[CalendarReservationResponse]:
        """제안: GET /calendar/reservations. 일·주·월 조회는 기간만 다르게 받는다.

        반환: list[CalendarReservationResponse].
        요청 계약: 시간대가 있는 start_at/end_at, scope(all/mine), 선택적 room_id.
        DTO에서 시간대와 end_at > start_at을 검증한다. 응답 계약은 서비스 주석 참조.
        current_user는 인증된 사용자 객체를 전달받는 계약이다.
        해당 사용자의 user_id와 query를 서비스에 전달하고 결과를 그대로 반환한다.
        TODO: HTTP 라우터 등록 시 로그인 인증 의존성을 연결한다.
        컨트롤러에서는 쿼리·날짜·업무 조건을 계산하지 않는다.
        """
        return self.service.get_calendar_reservations(
            user_id=current_user.user_id,
            query=query,
        )

    # 회의실 목록 조회
    def get_calendar_rooms(self, current_user: User) -> list[RoomOut]:
        """로그인 사용자에게 회의실 선택 항목을 제공하는 조회 메서드.

        캘린더에서 회의실별 예약을 필터링하거나 예약 페이지에서 회의실을
        선택할 때 사용할 목록을 서비스에 요청한다.
        입력: 인증 의존성이 제공할 current_user(User).
        반환: 회의실 ID·이름·상태·수용 인원을 담은 list[RoomOut].
        제안 경로: GET /calendar/rooms. 현재는 미등록·미구현 스켈레톤이다.

        TODO: 로그인 인증을 연결한 뒤 service.get_calendar_rooms를 호출한다.
        기존 RoomOut(room_id, name, status, capacity)을 재사용한다.
        인증 필요성을 명시하기 위해 current_user를 받으며, HTTP 연결은 하지 않는다.
        """
        return self.service.get_calendar_rooms()

    # 예약 화면의 회의실별 금일 예약 조회
    def get_my_today_reservations(
        self,
        query: ReservationListQuery,
        current_user: User,
    ) -> ReservationListOut:
        """예약자 구분 없이 오늘 남은 예약을 페이지로 조회한다.

        사용자 인증은 HTTP 계층에서 연결하며, 전달받은 User를 사용한다.
        """
        return self.service.get_my_today_reservations(
            user_id=current_user.user_id,
            room_id=query.room_id,
            page=query.page,
        )


router = APIRouter(prefix="/api", tags=["reservations"])


@router.get("/rooms", response_model=list[RoomOut])
def get_reservation_rooms(
    identity=Depends(authenticated, scope="function"),
    db: Session = Depends(get_db),
):
    return list_rooms(db)


@router.get("/rooms/{room_id}/reservations", response_model=ReservationListOut)
def get_room_reservations(
    room_id: UUID,
    page: int = Query(default=1, ge=1),
    identity=Depends(authenticated, scope="function"),
    db: Session = Depends(get_db),
):
    if db.get(Room, room_id) is None:
        raise ApiError(404, "ROOM_NOT_FOUND", "회의실을 찾을 수 없습니다.")
    controller = ReservationController(ReservationService(db))
    return controller.get_my_today_reservations(
        query=ReservationListQuery(room_id=room_id, page=page),
        current_user=identity[0],
    )


@router.post("/reservations", response_model=ReservationCreateOut, status_code=201)
def create_reservation(
    body: ReservationCreateIn,
    background_tasks: BackgroundTasks,
    identity=Depends(authenticated, scope="function"),
    db: Session = Depends(get_db),
):
    controller = ReservationController(ReservationService(db))
    result = controller.create_reservation(data=body, current_user=identity[0])
    background_tasks.add_task(notify_reservation_created, result.reservation_id)
    return result


@router.delete("/reservations/{reservation_id}", status_code=204, response_class=Response)
def delete_reservation(
    reservation_id: UUID,
    identity=Depends(authenticated, scope="function"),
    db: Session = Depends(get_db),
):
    ReservationService(db).delete_reservation(reservation_id, identity[0].user_id)
    return Response(status_code=204)


# 기존 동기 세션으로 컨트롤러와 서비스를 구성한다. 세션 수명은 get_db가 관리한다.
def get_reservation_controller(db: Session = Depends(get_db)) -> ReservationController:
    return ReservationController(ReservationService(db))


# 세션 인증을 거쳐 캘린더 조회 요청을 컨트롤러에 전달한다.
@router.get("/calendar/reservations", response_model=list[CalendarReservationResponse], tags=["calendar"])
def get_calendar_reservations(
    query: Annotated[CalendarQuery, Query()],
    response: Response,
    identity=Depends(authenticated, scope="function"),
    controller: ReservationController = Depends(get_reservation_controller),
):
    response.headers["Cache-Control"] = "no-store"
    return controller.get_calendar_reservations(query, identity[0])


# 인증된 사용자에게 캘린더 필터용 회의실 목록을 제공한다.
@router.get("/calendar/rooms", response_model=list[RoomOut], tags=["calendar"])
def get_calendar_rooms(
    response: Response,
    identity=Depends(authenticated, scope="function"),
    controller: ReservationController = Depends(get_reservation_controller),
):
    response.headers["Cache-Control"] = "no-store"
    return controller.get_calendar_rooms(identity[0])


# 예약자가 참석자마다 1:1 채팅방으로 예약 안내를 보낸다.
@router.post("/reservations/{reservation_id}/share", response_model=ReservationShareOut)
def share_reservation(
    reservation_id: UUID,
    identity=Depends(authenticated, scope="function"),
    controller: ReservationController = Depends(get_reservation_controller),
):
    return controller.share_reservation(reservation_id, identity[0])


# 구간에 다른 회의가 있는 사용자 id 목록. 참석자 선택 화면이 선택 불가 표시에 쓴다.
@router.get("/reservations/busy-users", response_model=BusyUsersOut)
def get_busy_users(
    query: Annotated[BusyUsersQuery, Query()],
    response: Response,
    identity=Depends(authenticated, scope="function"),
    controller: ReservationController = Depends(get_reservation_controller),
):
    response.headers["Cache-Control"] = "no-store"
    return controller.get_busy_users(query, identity[0])


# 가능한 시간 조회 API :  회의실 ID, 날짜, 슬롯 길이를 쿼리로 받아 컨트롤러에 전달한다.
@router.get("/rooms/{room_id}/availability", response_model=list[TimeSlotOut])
def get_room_availability(
    response: Response,
    room_id: UUID,
    date: date_type,
    slot_minutes: int = Query(default=60, ge=60, le=60),
    identity=Depends(authenticated, scope="function"),
    controller: ReservationController = Depends(get_reservation_controller),
):
    query = AvailabilityQuery(room_id=room_id, date=date, slot_minutes=slot_minutes)
    response.headers["Cache-Control"] = "no-store"
    return controller.get_room_availability(query, identity[0])

