from datetime import date as date_type
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.dependencies import authenticated
from app.db.session import get_db
from app.schemas.schedule_share import DayShareTextOut, ShareTextOut
from app.services.schedule_share import ScheduleShareService

router = APIRouter(prefix="/api", tags=["schedule-share"])


@router.get("/reservations/{reservation_id}/share-text", response_model=ShareTextOut)
def get_reservation_share_text(
    reservation_id: UUID,
    response: Response,
    identity=Depends(authenticated, scope="function"),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return ScheduleShareService(db).share_reservation(reservation_id)


@router.get("/calendar/share-text", response_model=DayShareTextOut)
def get_day_share_text(
    response: Response,
    date: date_type | None = None,
    identity=Depends(authenticated, scope="function"),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    return ScheduleShareService(db).share_day(identity[0].user_id, date)
