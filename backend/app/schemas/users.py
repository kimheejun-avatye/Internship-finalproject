import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.users import Team


# 같은 팀 동료 검색 결과. phone, birth_date 는 내보내지 않는다
class UserSearchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    name: str
    email: str
    team: Team


class UserSearchPageOut(BaseModel):
    items: list[UserSearchOut]
    # 다음 요청의 cursor 값. 더 없으면 None
    next_cursor: Optional[str]
