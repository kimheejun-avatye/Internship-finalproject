# 관리자 기능: 가입 승인·거절, 구성원 차단, 회의실 일시 차단

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ApiError
from app.models.room_blocks import RoomBlock
from app.models.rooms import Room
from app.models.users import Role, User
from app.schemas.admin import AdminRoomOut, AdminUserOut, UserStatus
from app.services import room_blocks


def _now() -> datetime:
    return datetime.now(timezone.utc)


def user_status(user: User) -> UserStatus:
    if user.blocked_at is not None:
        return "BLOCKED"
    if user.approved_at is None:
        return "PENDING"
    return "ACTIVE"


def _user_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        user_id=user.user_id,
        email=user.email,
        name=user.name,
        team=user.team,
        role=user.role,
        status=user_status(user),
        created_at=user.created_at,
        approved_at=user.approved_at,
        blocked_at=user.blocked_at,
    )


def _lock_user(db: Session, user_id: UUID) -> User:
    # 두 관리자가 같은 회원을 동시에 처리해도 한 번만 반영되도록 행을 잠근다
    user = db.scalar(select(User).where(User.user_id == user_id).with_for_update())
    if user is None:
        raise ApiError(404, "USER_NOT_FOUND", "회원을 찾을 수 없습니다.")
    return user


def _require_pending(user: User) -> None:
    if user_status(user) != "PENDING":
        raise ApiError(409, "USER_NOT_PENDING", "승인 대기 중인 회원이 아닙니다.")


def list_users(db: Session) -> list[AdminUserOut]:
    users = db.scalars(select(User).order_by(User.created_at.desc()))
    return [_user_out(user) for user in users]


def approve_user(db: Session, user_id: UUID) -> AdminUserOut:
    user = _lock_user(db, user_id)
    _require_pending(user)
    user.approved_at = _now()
    db.commit()
    return _user_out(user)


def reject_user(db: Session, user_id: UUID) -> None:
    """승인 대기 계정을 지운다. 같은 이메일로 다시 가입할 수 있다."""
    user = _lock_user(db, user_id)
    _require_pending(user)
    db.delete(user)
    db.commit()


def block_user(db: Session, user_id: UUID) -> AdminUserOut:
    """MEMBER 만 차단한다. 해제는 없으며, 차단된 계정은 모든 요청이 거부된다."""
    user = _lock_user(db, user_id)
    if user.role != Role.MEMBER:
        raise ApiError(403, "CANNOT_BLOCK_ADMIN", "관리자는 차단할 수 없습니다.")
    if user.blocked_at is not None:
        raise ApiError(409, "USER_ALREADY_BLOCKED", "이미 차단된 회원입니다.")
    user.blocked_at = _now()
    db.commit()
    return _user_out(user)


def list_rooms(db: Session) -> list[AdminRoomOut]:
    now = _now()
    # 회의실마다 지금 걸려 있는 차단의 종료 시각을 한 번에 구한다
    active = dict(
        db.execute(
            select(RoomBlock.room_id, func.max(RoomBlock.end_at))
            .where(RoomBlock.start_at <= now, RoomBlock.end_at > now)
            .group_by(RoomBlock.room_id)
        ).all()
    )
    rooms = db.scalars(select(Room).order_by(Room.name))
    return [
        AdminRoomOut(
            room_id=room.room_id,
            name=room.name,
            status=room.status,
            capacity=room.capacity,
            blocked_until=active.get(room.room_id),
        )
        for room in rooms
    ]


def block_room(db: Session, room_id: UUID, admin: User) -> AdminRoomOut:
    """지금부터 ROOM_BLOCK_MINUTES 동안 회의실을 막는다. 겹치는 기존 예약도 그 구간은 이용할 수 없다."""
    # 동시에 두 번 차단해 차단 기록이 겹치지 않도록 회의실 행을 잠근다
    room = db.scalar(select(Room).where(Room.room_id == room_id).with_for_update())
    if room is None:
        raise ApiError(404, "ROOM_NOT_FOUND", "회의실을 찾을 수 없습니다.")

    now = _now()
    if room_blocks.blocked_until(db, room.room_id, now) is not None:
        raise ApiError(409, "ROOM_ALREADY_BLOCKED", "이미 차단 중인 회의실입니다.")

    end_at = now + timedelta(minutes=settings.room_block_minutes)
    db.add(RoomBlock(room_id=room.room_id, blocked_by=admin.user_id, start_at=now, end_at=end_at))
    db.commit()
    return AdminRoomOut(
        room_id=room.room_id,
        name=room.name,
        status=room.status,
        capacity=room.capacity,
        blocked_until=end_at,
    )
