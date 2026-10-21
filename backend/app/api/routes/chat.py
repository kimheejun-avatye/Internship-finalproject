from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import authenticated
from app.db.session import get_db
from app.schemas.chat import (
    ChatRoomOut,
    DirectRoomIn,
    GroupRoomIn,
    MessageIn,
    MessageOut,
    MessagePageOut,
)
from app.services import chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/rooms", response_model=list[ChatRoomOut])
def list_rooms(identity=Depends(authenticated, scope="function"), db=Depends(get_db)):
    return chat.list_rooms(db, identity[0])


# 기존 방이 있으면 200, 새로 만들면 201
@router.post("/rooms/direct", response_model=ChatRoomOut)
def open_direct(
    body: DirectRoomIn,
    response: Response,
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    room, created = chat.open_direct(db, identity[0], body.user_id)
    response.status_code = 201 if created else 200
    return room


@router.post("/rooms/group", response_model=ChatRoomOut, status_code=201)
def create_group(
    body: GroupRoomIn,
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.create_group(db, identity[0], body.title, body.member_ids)


@router.get("/rooms/{chat_room_id}", response_model=ChatRoomOut)
def room_detail(
    chat_room_id: UUID,
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.room_detail(db, chat_room_id, identity[0])


@router.get("/rooms/{chat_room_id}/messages", response_model=MessagePageOut)
def list_messages(
    chat_room_id: UUID,
    before: Optional[UUID] = None,
    limit: int = Query(30, ge=1, le=100),
    identity=Depends(authenticated, scope="function"),
    db=Depends(get_db),
):
    return chat.list_messages(db, chat_room_id, identity[0], before, limit)


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
        db, chat_room_id, identity[0], body.content, body.client_id
    )
