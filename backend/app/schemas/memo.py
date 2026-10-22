import uuid

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class MemoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    memo_id: uuid.UUID
    reservation_id: uuid.UUID
    user_id: uuid.UUID
    memo: str | None
    created_at: AwareDatetime
    updated_at: AwareDatetime | None


class MemoSaveIn(BaseModel):
    # Field() -> 요청 본문에 meomo 키가 필수인 상태가 유지됨
    memo: str | None = Field()
