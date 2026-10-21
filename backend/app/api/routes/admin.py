from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.admin_auth import current_admin
from app.db.session import get_db
from app.models.users import User
from app.schemas.admin import AdminRoomOut, AdminUserOut
from app.services import admin

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(current_admin)])


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)):
    return admin.list_users(db)


@router.post("/users/{user_id}/approve", response_model=AdminUserOut)
def approve_user(user_id: UUID, db: Session = Depends(get_db)):
    return admin.approve_user(db, user_id)


@router.post("/users/{user_id}/reject", status_code=204)
def reject_user(user_id: UUID, db: Session = Depends(get_db)):
    admin.reject_user(db, user_id)
    return Response(status_code=204)


@router.post("/users/{user_id}/block", response_model=AdminUserOut)
def block_user(user_id: UUID, db: Session = Depends(get_db)):
    return admin.block_user(db, user_id)


@router.get("/rooms", response_model=list[AdminRoomOut])
def list_rooms(db: Session = Depends(get_db)):
    return admin.list_rooms(db)


@router.post("/rooms/{room_id}/block", response_model=AdminRoomOut)
def block_room(room_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_admin)):
    return admin.block_room(db, room_id, user)
