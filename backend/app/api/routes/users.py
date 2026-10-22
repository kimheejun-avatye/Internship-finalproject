from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import authenticated
from app.db.session import get_db
from app.schemas.users import UserSearchPageOut
from app.services import users

router = APIRouter(prefix="/api/users", tags=["users"])


# 전체 멤버 검색. 채팅 상대 선택과 예약 참여자 자동완성에서 같이 쓴다
@router.get("/search", response_model=UserSearchPageOut)
def search(
    q: str = Query("", max_length=50),
    cursor: Optional[str] = Query(None, max_length=512),
    limit: int = Query(20, ge=1, le=50),
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return users.search_members(db, identity[0], q.strip(), cursor, limit)
