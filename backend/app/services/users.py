import base64
import json
from typing import Optional
from uuid import UUID

from sqlalchemy import or_, select, tuple_

from app.core.exceptions import ApiError
from app.models.users import User


def cursor_invalid():
    return ApiError(400, "USER_CURSOR_INVALID", "잘못된 검색 위치입니다.")


def escape_like(value: str) -> str:
    """LIKE 패턴 문자(\\, %, _)를 이스케이프한다. ESCAPE '\\' 와 함께 쓴다."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# 커서는 마지막 사용자의 (name, user_id). 프런트는 내용을 몰라도 되도록 base64 로 감싼다
def encode_cursor(user: User) -> str:
    raw = json.dumps([user.name, str(user.user_id)], ensure_ascii=False).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[str, UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        name, user_id = json.loads(raw)
        return str(name), UUID(user_id)
    except (ValueError, TypeError):
        raise cursor_invalid()


def search_teammates(db, user: User, q: str, cursor: Optional[str], limit: int) -> dict:
    """로그인 사용자와 같은 팀의 동료를 이름순으로 찾는다.

    - 팀은 세션 사용자로 정한다. 나, 차단(blocked_at), 승인 대기(approved_at IS NULL)는 제외
    - q 가 비면 같은 팀 전체(친구 목록)
    - q 가 있으면 이름 ILIKE '%q%' 또는 이메일 ILIKE 'q%'
    - (name, user_id) 순 keyset 페이지네이션
    """
    query = select(User).where(
        User.team == user.team,
        User.user_id != user.user_id,
        User.blocked_at.is_(None),
        User.approved_at.is_not(None),
    )
    if q:
        pattern = escape_like(q)
        query = query.where(
            or_(
                User.name.ilike(f"%{pattern}%", escape="\\"),
                User.email.ilike(f"{pattern}%", escape="\\"),
            )
        )
    if cursor:
        query = query.where(tuple_(User.name, User.user_id) > tuple_(*decode_cursor(cursor)))
    # 한 명 더 읽어 다음 페이지가 있는지 본다
    found = list(db.scalars(query.order_by(User.name, User.user_id).limit(limit + 1)))
    items = found[:limit]
    return {
        "items": items,
        "next_cursor": encode_cursor(items[-1]) if len(found) > limit else None,
    }
