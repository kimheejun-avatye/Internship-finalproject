import re
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.users import Team

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE = re.compile(r"^01[016789][0-9]{7,8}$")


def normalize_email(value: str) -> str:
    return value.strip().lower()


class EmailIn(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = normalize_email(v)
        if len(v) > 254 or not _EMAIL.match(v):
            raise ValueError("이메일 형식이 올바르지 않습니다.")
        return v


class CheckEmailOut(BaseModel):
    status: str  # AVAILABLE | REGISTERED | PENDING


class SendCodeOut(BaseModel):
    cooldown_seconds: int
    expires_in: int


class VerifyCodeIn(EmailIn):
    code: str = Field(pattern=r"^[0-9]{6}$")


class VerifyCodeOut(BaseModel):
    signup_token: str
    expires_in: int


class SignupIn(EmailIn):
    signup_token: str
    password: str
    name: str
    birth_date: date
    phone: str
    team: Team
    # 부서/직무는 프로필 표시용 문자열 하나로 받으며, 항목 분리나 구분자 입력을 강제하지 않는다.
    position: str

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if not 8 <= len(v) <= 64:
            raise ValueError("비밀번호는 8~64자여야 합니다.")
        if any(c.isspace() for c in v):
            raise ValueError("비밀번호에 공백을 사용할 수 없습니다.")
        has_letter = re.search(r"[A-Za-z]", v)
        has_digit = re.search(r"[0-9]", v)
        has_special = re.search(r"[^A-Za-z0-9]", v)
        if not (has_letter and has_digit and has_special):
            raise ValueError("비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 50:
            raise ValueError("이름은 1~50자여야 합니다.")
        return v

    # 프론트 검증을 우회한 요청도 처리하므로 서버에서도 공백을 제거하고 필수 입력을 검증한다.
    @field_validator("position")
    @classmethod
    def _position(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("부서 / 직무를 입력해 주세요.")
        return v

    @field_validator("birth_date")
    @classmethod
    def _birth_date(cls, v: date) -> date:
        if not date(1900, 1, 1) <= v <= date.today():
            raise ValueError("생일이 올바르지 않습니다.")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = re.sub(r"[-\s]", "", v)
        if not _PHONE.match(v):
            raise ValueError("휴대폰번호 형식이 올바르지 않습니다.")
        return v


class SignupOut(BaseModel):
    user_id: str
    status: str = "PENDING"
