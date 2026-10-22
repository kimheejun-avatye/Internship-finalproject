"""회의 정보를 기존 텍스트 채팅으로 전송할 문구로 구성한다."""

from datetime import date as date_type
from datetime import datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ApiError
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room
from app.schemas.schedule_share import DayShareTextOut, ShareTextOut
from app.services import clock

KST = ZoneInfo("Asia/Seoul")
MAX_SHARE_TEXT_LENGTH = 2000


def _share_text(rows, heading: str) -> ShareTextOut:
    parts = []
    ids = []
    for reservation, room_name in rows:
        start = reservation.start_at.astimezone(KST).strftime("%Y-%m-%d %H:%M")
        end = reservation.end_at.astimezone(KST).strftime("%Y-%m-%d %H:%M")
        parts.append(
            f"제목: {reservation.title}\n"
            f"일시: {start} ~ {end}\n"
            f"회의실: {room_name}"
        )
        ids.append(reservation.reservation_id)
    text = heading + "\n\n" + "\n\n".join(parts) if parts else ""
    if len(text) > MAX_SHARE_TEXT_LENGTH:
        raise ApiError(
            400, "SHARE_TEXT_TOO_LONG",
            "공유 문구는 2000자까지 전송할 수 있습니다. 회의를 한 건씩 선택해 공유해주세요.",
        )
    return ShareTextOut(reservation_ids=ids, count=len(ids), text=text)


class ScheduleShareService:
    def __init__(self, db: Session):
        self.db = db

    def share_reservation(self, reservation_id: UUID) -> ShareTextOut:
        """로그인 사용자에게 캘린더에 공개된 회의 정보를 제공한다."""
        row = self.db.execute(
            select(Reservation, Room.name)
            .join(Room, Room.room_id == Reservation.room_id)
            .where(Reservation.reservation_id == reservation_id)
        ).one_or_none()
        if row is None:
            raise ApiError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.")
        return _share_text([row], "[회의 일정: 한국 시간]")

    def share_day(self, user_id: UUID, date: date_type | None = None) -> DayShareTextOut:
        day = date if date is not None else clock.now().astimezone(KST).date()
        start = datetime.combine(day, time.min, tzinfo=KST)
        try:
            end = start + timedelta(days=1)
        except OverflowError:
            raise ApiError(422, "SHARE_DATE_INVALID", "조회할 수 없는 날짜입니다.") from None
        attending = (
            select(ReservationAttendee.user_id)
            .where(
                ReservationAttendee.reservation_id == Reservation.reservation_id,
                ReservationAttendee.user_id == user_id,
            )
            .exists()
        )
        rows = self.db.execute(
            select(Reservation, Room.name)
            .join(Room, Room.room_id == Reservation.room_id)
            .where(Reservation.start_at < end, Reservation.end_at > start, attending)
            .order_by(Reservation.start_at, Reservation.reservation_id)
        ).all()
        result = _share_text(rows, f"[{day.isoformat()} 내 참석 일정: 한국 시간]")
        return DayShareTextOut(date=day, **result.model_dump())
