from datetime import datetime

from pydantic import BaseModel, Field

from app.models.users import Team
from app.schemas.auth import EmailIn


class LoginIn(EmailIn):
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    position: str = ""
    team: Team
    role: str


class SessionOut(BaseModel):
    user: UserOut
    csrf_token: str
    idle_expires_at: datetime
    absolute_expires_at: datetime


class ExpiryOut(BaseModel):
    idle_expires_at: datetime
    absolute_expires_at: datetime
