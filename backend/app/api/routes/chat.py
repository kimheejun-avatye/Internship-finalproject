from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import authenticated
from app.db.session import get_db
from app.schemas.chat import (
    DirectRoomIn,
    GroupRoomIn,
    MessageIn,
    MessageOut,
    MessagePageOut,
    RoomDetailOut,
    RoomPageOut,
)
from app.services import chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


# 내 채팅방 목록. q 는 표시 제목 검색
@router.get("/rooms", response_model=RoomPageOut)
def list_rooms(
    q: str = Query("", max_length=50),
    cursor: Optional[str] = Query(None, max_length=512),
    limit: int = Query(20, ge=1, le=50),
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.list_rooms(db, identity[0], q.strip(), cursor, limit)


# 기존 방이 있으면 200, 새로 만들면 201
@router.post("/rooms/direct", response_model=RoomDetailOut)
def open_direct(
    body: DirectRoomIn,
    response: Response,
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    room, created = chat.open_direct(db, identity[0], body.target_user_id)
    response.status_code = 201 if created else 200
    return room


@router.post("/rooms/group", response_model=RoomDetailOut, status_code=201)
def create_group(
    body: GroupRoomIn,
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.create_group(db, identity[0], body.title, body.member_ids)


@router.get("/rooms/{chat_room_id}", response_model=RoomDetailOut)
def room_detail(
    chat_room_id: UUID,
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.room_detail(db, chat_room_id, identity[0])


@router.get("/rooms/{chat_room_id}/messages", response_model=MessagePageOut)
def list_messages(
    chat_room_id: UUID,
    cursor: Optional[str] = Query(None, max_length=512),
    limit: int = Query(30, ge=1, le=100),
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.list_messages(db, chat_room_id, identity[0], cursor, limit)


@router.post(
    "/rooms/{chat_room_id}/messages", response_model=MessageOut, status_code=201
)
def send_message(
    chat_room_id: UUID,
    body: MessageIn,
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.send_message(
        db, chat_room_id, identity[0], body.message, body.client_id
    )
