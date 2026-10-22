from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.dependencies import authenticated
from app.db.session import get_db
from app.schemas.memo import MemoOut, MemoSaveIn
from app.services.memo import MemoService

router = APIRouter(prefix="/api", tags=["memos"])
@router.get("/reservations/{reservation_id}/memo", response_model=MemoOut | None)

def get_my_memo(reservation_id: UUID, response: Response, identity=Depends(authenticated, scope="function"), db: Session = Depends(get_db),):
    response.headers["Cache-Control"] = "no-store"
    service = MemoService(db)
    return service.get_my_memo(reservation_id, identity[0].user_id)

@router.put("/reservations/{reservation_id}/memo", response_model=MemoOut)
def save_my_memo(reservation_id: UUID, body: MemoSaveIn, response: Response, identity=Depends(authenticated, scope="function"), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    service = MemoService(db)
    return service.save_my_memo(reservation_id, identity[0].user_id, body.memo)
