from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.exceptions import ApiError
from app.models import Memo, Reservation
from app.models.reservation_attendee import ReservationAttendee
from app.schemas.memo import MemoOut


class MemoService:
    # 본인 메모 조회 서비스
    def __init__(self, db: Session):
        self.db = db

    def get_my_memo(self, reservation_id, user_id):
        reservation = self.db.get(Reservation, reservation_id)

        if reservation is None:
            raise ApiError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.")

        attendee = self.db.get(ReservationAttendee, (reservation_id, user_id))

        if attendee is None:
            raise ApiError(403, "MEMO_FORBIDDEN", "메모에 접근할 권한이 없습니다.")

        memo = self.db.scalar(select(Memo).where(Memo.reservation_id == reservation_id, Memo.user_id == user_id))

        return memo

    def save_my_memo(self, reservation_id, user_id, memo):
        try:
            reservation = self.db.scalar(
                select(Reservation).where(Reservation.reservation_id == reservation_id)
                .with_for_update().execution_options(populate_existing=True)
            )
            if reservation is None:
                raise ApiError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.")

            attendee = self.db.get(ReservationAttendee, (reservation_id, user_id))

            if attendee is None:
                raise ApiError(403, "MEMO_FORBIDDEN", "메모에 접근할 권한이 없습니다.")

            insert_statement = insert(Memo).values(
                reservation_id=reservation_id, user_id=user_id, memo=memo
            )

            do_update_statement = insert_statement.on_conflict_do_update(
                constraint="uq_memo_reservation_user",
                set_=dict(memo=memo, updated_at=func.now())
            ).returning(Memo)

            saved_memo = self.db.scalar(do_update_statement)
            result = MemoOut.model_validate(saved_memo)

            self.db.commit()
            return result

        except Exception:
            self.db.rollback()
            raise
