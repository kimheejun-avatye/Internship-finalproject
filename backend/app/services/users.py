from sqlalchemy import or_, select

from app.models.users import User


def escape_like(value: str) -> str:
    """LIKE 패턴 문자(\\, %, _)를 이스케이프한다. ESCAPE '\\' 와 함께 쓴다."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_teammates(db, user: User, q: str, limit: int) -> list[User]:
    """로그인 사용자와 같은 팀의 동료를 이름순으로 찾는다.

    - 팀은 세션 사용자로 정한다. 나, 차단(blocked_at), 승인 대기(approved_at IS NULL)는 제외
    - q 가 비면 같은 팀 전체(친구 목록)
    - q 가 있으면 이름 ILIKE '%q%' 또는 이메일 ILIKE 'q%'
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
    return list(db.scalars(query.order_by(User.name, User.email).limit(limit)))
