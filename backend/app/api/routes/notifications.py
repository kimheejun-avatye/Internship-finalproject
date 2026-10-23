from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.dependencies import authenticated
from app.schemas.notifications import NotificationListOut, NotificationReadOut
from app.services.notifications import NotificationStore, get_notification_store

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
def get_my_notifications(
    response: Response,
    identity=Depends(authenticated, scope="function"),
    store: NotificationStore = Depends(get_notification_store),
):
    response.headers["Cache-Control"] = "no-store"
    return NotificationListOut(
        items=store.list_for_user(identity[0].user_id),
        retention_limit=store.retention_limit,
    )


@router.patch("/{notification_id}/read", response_model=NotificationReadOut)
def mark_my_notification_read(
    notification_id: UUID,
    response: Response,
    identity=Depends(authenticated, scope="function"),
    store: NotificationStore = Depends(get_notification_store),
):
    response.headers["Cache-Control"] = "no-store"
    return store.mark_read(identity[0].user_id, notification_id)
