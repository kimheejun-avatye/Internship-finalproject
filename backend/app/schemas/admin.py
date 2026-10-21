import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.models.rooms import RoomStatus
from app.models.users import Role, Team

# PENDING: 승인 대기, ACTIVE: 승인됨, BLOCKED: 차단됨
UserStatus = Literal["PENDING", "ACTIVE", "BLOCKED"]


class AdminUserOut(BaseModel):
    user_id: uuid.UUID
    email: str
    name: str
    team: Team
    role: Role
    status: UserStatus
    created_at: datetime
    approved_at: Optional[datetime]
    blocked_at: Optional[datetime]


class AdminRoomOut(BaseModel):
    room_id: uuid.UUID
    name: str
    status: RoomStatus
    capacity: int
    # 지금 걸려 있는 일시 차단이 끝나는 시각. 차단 중이 아니면 None
    blocked_until: Optional[datetime]
