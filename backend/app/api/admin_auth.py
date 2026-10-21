# 관리자 API 의 권한 확인. 모든 관리자 라우트는 이 의존성 하나만 쓴다

from fastapi import Depends

from app.api.dependencies import authenticated
from app.core.exceptions import ApiError
from app.models.users import Role, User


def current_admin(identity=Depends(authenticated, scope="function")) -> User:
    """로그인한 ADMIN 사용자를 돌려준다. 로그인 안 됨·차단·승인 대기는 authenticated 가 먼저 막는다."""
    user, _ = identity
    if user.role != Role.ADMIN:
        raise ApiError(403, "ADMIN_REQUIRED", "관리자만 사용할 수 있습니다.")
    return user
