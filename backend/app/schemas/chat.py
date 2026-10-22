import uuid
from typing import Literal, Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.models.chat_memo import ChatRoomType


class ChatUserOut(BaseModel):
    user_id: uuid.UUID
    name: str


class ReservationCardOut(BaseModel):
    """예약 카드 메시지에 담긴, 보낸 시점의 예약 정보."""

    reservation_id: uuid.UUID
    title: str
    start_at: AwareDatetime
    end_at: AwareDatetime
    room_name: str


class MessageOut(BaseModel):
    message_id: uuid.UUID
    chat_room_id: uuid.UUID
    # sender.user_id 와 같은 값
    user_id: uuid.UUID
    sender: ChatUserOut
    message: str
    # RESERVATION 이면 payload 에 예약 카드 데이터가 있다. message 에는 같은 내용의 글이 들어 있다
    kind: Literal["TEXT", "RESERVATION"] = "TEXT"
    payload: Optional[ReservationCardOut] = None
    created_at: AwareDatetime
    # 전송 요청의 client_id 를 그대로 돌려준다. 과거 조회에서는 None
    client_id: Optional[str] = None


# 채팅방 목록 항목. 응답·room.updated 이벤트 모두 받는 사람 기준으로 만든다
class RoomSummaryOut(BaseModel):
    chat_room_id: uuid.UUID
    type: ChatRoomType
    # 그룹방에 지정한 제목. 1:1방과 자동 제목 그룹방은 None
    title: Optional[str]
    # title 이 있으면 title, 없으면 나를 뺀 참여자 이름으로 서버가 만든다
    display_title: str
    # 나를 포함한 현재 참여자 수
    member_count: int
    last_message: Optional[MessageOut]
    # 마지막 메시지 시각. 메시지가 없으면 방 생성 시각
    last_activity_at: AwareDatetime
    created_at: AwareDatetime


class RoomDetailOut(RoomSummaryOut):
    # 나를 제외한 현재 참여자
    members: list[ChatUserOut]


class RoomPageOut(BaseModel):
    items: list[RoomSummaryOut]
    # 다음 요청의 cursor 값. 더 없으면 None
    next_cursor: Optional[str]


class DirectRoomIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_user_id: uuid.UUID


class GroupRoomIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # null·생략·빈 문자열이면 자동 제목
    title: Optional[str] = None
    # 나를 뺀 2명 이상. 나를 빼고 중복을 지우는 일은 세션 사용자를 아는 서비스에서 한다
    member_ids: list[uuid.UUID]

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if len(value) > 50:
            raise ValueError("방 이름은 50자 이하여야 합니다.")
        return value or None


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    # 프런트 임시 id. 저장하지 않고 응답·이벤트에 그대로 돌려준다
    client_id: Optional[str] = Field(default=None, max_length=64)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 2000:
            raise ValueError("메시지는 1~2000자여야 합니다.")
        return value


class MessagePageOut(BaseModel):
    items: list[MessageOut]
    # 다음 요청의 cursor 값. 더 없으면 None
    next_cursor: Optional[str]
