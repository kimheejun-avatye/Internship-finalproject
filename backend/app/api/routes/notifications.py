from fastapi import APIRouter, Depends, Response

from app.api.dependencies import authenticated
from app.schemas.notifications import NotificationListOut
from app.services.notifications import NotificationStore

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def get_notification_store() -> NotificationStore:
    return NotificationStore()


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
