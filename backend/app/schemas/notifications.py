from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field


class NotificationOut(BaseModel):
    notification_id: UUID
    type: Literal["reservation.created"] = "reservation.created"
    reservation_id: UUID
    title: str
    room_name: str
    start_at: AwareDatetime
    end_at: AwareDatetime
    message: str
    created_at: AwareDatetime


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    retention_limit: int = Field(ge=1)
