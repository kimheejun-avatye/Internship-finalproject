import uuid

from pydantic import BaseModel

from app.models.users import Team


# 같은 팀 동료 검색 결과. phone, birth_date 는 내보내지 않는다
class UserSearchOut(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    team: Team
