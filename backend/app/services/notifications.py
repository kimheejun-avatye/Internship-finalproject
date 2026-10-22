"""저장된 예약의 참여자별 참석 알림을 생성하고 Redis에 보관한다."""

import logging
from uuid import UUID, uuid5
from zoneinfo import ZoneInfo

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ApiError
from app.db.redis import get_redis_client
from app.db.session import SessionLocal
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.models.rooms import Room
from app.schemas.notifications import NotificationOut
from app.services import clock
from app.services.realtime import event, publish_to_users

KST = ZoneInfo("Asia/Seoul")
NOTIFICATION_NAMESPACE = UUID("28e823fb-266f-4b89-b330-c21ef2d65040")
logger = logging.getLogger(__name__)

# 중복 검사, 저장, 보관량 제한을 Redis 안에서 한 번에 실행한다.
SAVE_NOTIFICATION = """
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for _, item in ipairs(items) do
    if cjson.decode(item).notification_id == ARGV[1] then
        return 0
    end
end
redis.call('LPUSH', KEYS[1], ARGV[2])
redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[3]) - 1)
return 1
"""


class NotificationStore:
    def __init__(
        self,
        client: Redis | None = None,
        *,
        key_prefix: str = "meeting:notifications:",
        retention_limit: int | None = None,
    ):
        self.client = client if client is not None else get_redis_client()
        self.key_prefix = key_prefix
        self.retention_limit = (
            settings.notification_retention_limit if retention_limit is None else retention_limit
        )
        if self.retention_limit < 1:
            raise ValueError("알림 보관 개수는 1 이상이어야 합니다.")

    def save(self, user_id: UUID, notification: NotificationOut) -> bool:
        """새로 저장하면 True, 보관 중인 알림과 중복되면 False를 반환한다."""
        try:
            return bool(self.client.eval(
                SAVE_NOTIFICATION,
                1,
                self.key_prefix + str(user_id),
                str(notification.notification_id),
                notification.model_dump_json(),
                self.retention_limit,
            ))
        except RedisError as exc:
            raise ApiError(
                503, "NOTIFICATION_STORE_UNAVAILABLE", "알림을 저장하지 못했습니다."
            ) from exc

    def list_for_user(self, user_id: UUID) -> list[NotificationOut]:
        """해당 사용자의 보관 중인 알림을 삭제 없이 최신순으로 조회한다."""
        try:
            rows = self.client.lrange(self.key_prefix + str(user_id), 0, -1)
        except RedisError as exc:
            raise ApiError(
                503, "NOTIFICATION_STORE_UNAVAILABLE", "알림을 조회하지 못했습니다."
            ) from exc
        items = [NotificationOut.model_validate_json(row) for row in rows]
        return sorted(
            items,
            key=lambda item: (item.created_at, item.notification_id),
            reverse=True,
        )


def get_notification_store() -> NotificationStore:
    return NotificationStore()


class NotificationService:
    def __init__(self, db: Session, store: NotificationStore | None = None):
        self.db = db
        self.store = store if store is not None else NotificationStore()

    def create_for_reservation(self, reservation_id: UUID) -> dict[UUID, NotificationOut]:
        """예약과 참여자를 커밋한 뒤 호출한다. 새로 저장한 수신자별 알림을 반환한다."""
        row = self.db.execute(
            select(Reservation, Room.name)
            .join(Room, Room.room_id == Reservation.room_id)
            .where(Reservation.reservation_id == reservation_id)
        ).one_or_none()
        if row is None:
            raise ApiError(404, "RESERVATION_NOT_FOUND", "예약을 찾을 수 없습니다.")
        reservation, room_name = row
        user_ids = self.db.scalars(
            select(ReservationAttendee.user_id)
            .where(
                ReservationAttendee.reservation_id == reservation_id,
                ReservationAttendee.user_id != reservation.user_id,
            )
            .order_by(ReservationAttendee.user_id)
        ).all()
        start = reservation.start_at.astimezone(KST).strftime("%Y-%m-%d %H:%M")
        end = reservation.end_at.astimezone(KST).strftime("%Y-%m-%d %H:%M")
        message = (
            f"회의 참석 안내: {reservation.title}\n"
            f"회의실: {room_name}\n일시: {start} ~ {end} (한국 시간)"
        )
        created_at = clock.now()
        saved = {}
        for user_id in user_ids:
            notification = NotificationOut(
                notification_id=uuid5(NOTIFICATION_NAMESPACE, f"{reservation_id}:{user_id}"),
                reservation_id=reservation_id,
                title=reservation.title,
                room_name=room_name,
                start_at=reservation.start_at,
                end_at=reservation.end_at,
                message=message,
                created_at=created_at,
            )
            if self.store.save(user_id, notification):
                saved[user_id] = notification
        return saved


def notify_reservation_created(reservation_id: UUID) -> None:
    """커밋된 예약의 알림을 저장한 뒤 각 수신자의 웹소켓으로 전달한다."""
    try:
        with SessionLocal() as db:
            saved = NotificationService(db, get_notification_store()).create_for_reservation(reservation_id)
    except Exception:
        logger.warning("Reservation notification storage failed: %s", reservation_id, exc_info=True)
        return
    for user_id, notification in saved.items():
        try:
            publish_to_users([user_id], event("notification.created", notification.model_dump(mode="json")))
        except Exception:
            logger.warning("Reservation notification delivery failed: %s", notification.notification_id, exc_info=True)
