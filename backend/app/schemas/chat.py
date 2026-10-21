import uuid
from typing import Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.models.chat_rooms import ChatRoomType


class ChatUserOut(BaseModel):
    user_id: uuid.UUID
    name: str


class LastMessageOut(BaseModel):
    message_id: uuid.UUID
    sender_id: uuid.UUID
    content: str
    created_at: AwareDatetime


# 채팅방 목록 항목. 1:1방 생성·그룹방 생성·방 상세 응답도 같은 형식
class ChatRoomOut(BaseModel):
    chat_room_id: uuid.UUID
    type: ChatRoomType
    # 1:1방은 상대방 이름
    title: str
    # 나를 제외한 현재 참여자
    members: list[ChatUserOut]
    last_message: Optional[LastMessageOut]
    last_message_at: Optional[AwareDatetime]


class DirectRoomIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: uuid.UUID


class GroupRoomIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    member_ids: list[uuid.UUID]

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 50:
            raise ValueError("방 이름은 1~50자여야 합니다.")
        return value

    # 중복 제거 후 2명 이상. 나를 빼는 것은 세션 사용자를 아는 서비스에서 한다
    @field_validator("member_ids")
    @classmethod
    def unique_members(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        value = list(dict.fromkeys(value))
        if len(value) < 2:
            raise ValueError("나를 제외한 참여자가 2명 이상이어야 합니다.")
        return value


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    # 프런트 임시 id. 저장하지 않고 응답·이벤트에 그대로 돌려준다
    client_id: Optional[str] = Field(default=None, max_length=64)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 2000:
            raise ValueError("메시지는 1~2000자여야 합니다.")
        return value


class MessageOut(BaseModel):
    message_id: uuid.UUID
    chat_room_id: uuid.UUID
    sender: ChatUserOut
    content: str
    created_at: AwareDatetime
    client_id: Optional[str] = None


class MessagePageOut(BaseModel):
    items: list[MessageOut]
    # 다음 요청의 before 값. 더 없으면 None
    next_before: Optional[uuid.UUID]
    has_more: bool
