"""Security middleware for session-protected authentication and reservation APIs."""

import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.exceptions import ApiError
from app.db.session import SessionLocal
from app.services import login_limits

SESSION_PATHS = {
    "/api/auth/login",
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/activity",
}


def owns_path(path):
    return (
        path in SESSION_PATHS
        or path.startswith("/api/auth/password/")
        or path in {"/api/rooms", "/api/reservations"}
        or path.startswith("/api/rooms/")
        or path.startswith("/api/reservations/")
    )


def unavailable():
    return JSONResponse(
        {
            "detail": {
                "code": "SERVICE_UNAVAILABLE",
                "message": "일시적인 서버 오류입니다. 다시 시도해주세요.",
            }
        },
        status_code=503,
    )


def install_session_security(app):
    if len(settings.secret_key) < 32:
        raise RuntimeError("SECRET_KEY must contain at least 32 characters")
    if settings.production and not (settings.smtp_user and settings.smtp_password):
        raise RuntimeError("SMTP must be configured in production")
    if settings.production and (
        not settings.origins
        or any(not origin.startswith("https://") for origin in settings.origins)
    ):
        raise RuntimeError("Production APP_ORIGINS must contain HTTPS origins")

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if not owns_path(request.url.path):
            return await call_next(request)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("origin") not in settings.origins:
                return JSONResponse(
                    {
                        "detail": {
                            "code": "CSRF_FAILED",
                            "message": "허용하지 않은 요청 출처입니다.",
                        }
                    },
                    status_code=403,
                )
            if (
                request.headers.get("content-type", "").split(";")[0].strip()
                != "application/json"
            ):
                return JSONResponse(
                    {
                        "detail": {
                            "code": "CONTENT_TYPE",
                            "message": "JSON 요청이 필요합니다.",
                        }
                    },
                    status_code=415,
                )
        try:
            if request.url.path == "/api/auth/login" and request.method == "POST":
                with SessionLocal() as db:
                    login_limits.ip_limit(
                        db, request.client.host if request.client else "unknown"
                    )
            response = await call_next(request)
        except ApiError as exc:
            return JSONResponse(
                {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
            )
        except SQLAlchemyError:
            logging.getLogger(__name__).error(
                "Authentication database operation failed", exc_info=True
            )
            return unavailable()
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
