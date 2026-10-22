from datetime import date as date_type
from uuid import UUID

from pydantic import BaseModel, Field


class ShareTextOut(BaseModel):
    reservation_ids: list[UUID]
    count: int = Field(ge=0)
    text: str


class DayShareTextOut(ShareTextOut):
    date: date_type
