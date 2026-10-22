# 환경변수 설정. 루트 .env 를 읽는다. 수치는 모두 환경변수로 조정할 수 있다

import ipaddress
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL

load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=False)


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


class Settings:
    def __init__(self) -> None:
        self.production = os.environ.get("APP_ENV") == "production"
        self.origins = set(
            os.environ.get(
                "APP_ORIGINS",
                "http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:5173,http://localhost:5173",
            ).split(",")
        )
        self.cookie_name = "__Host-session" if self.production else "session"
        self.session_idle_seconds = 1800
        self.session_absolute_seconds = 28800
        self.secret_key = os.environ.get("SECRET_KEY", "")
        self.company_ips = os.environ.get("COMPANY_IPS", "127.0.0.1,::1")

        self.smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = _int("SMTP_PORT", 587)
        self.smtp_user = os.environ.get("SMTP_USER", "")
        # Gmail 앱 비밀번호는 4자리씩 공백으로 나뉘어 표시되므로 공백은 제거한다
        self.smtp_password = os.environ.get("SMTP_PASSWORD", "").replace(" ", "")

        self.code_ttl_seconds = _int("CODE_TTL_SECONDS", 300)
        self.resend_cooldown_seconds = _int("RESEND_COOLDOWN_SECONDS", 60)
        self.email_hourly_limit = _int("EMAIL_HOURLY_LIMIT", 5)
        self.ip_hourly_send_limit = _int("IP_HOURLY_SEND_LIMIT", 60)
        self.ip_minute_send_limit = _int("IP_MINUTE_SEND_LIMIT", 20)
        self.ip_hourly_check_limit = _int("IP_HOURLY_CHECK_LIMIT", 90)
        self.service_daily_send_limit = _int("SERVICE_DAILY_SEND_LIMIT", 400)
        self.max_failed_attempts = _int("MAX_FAILED_ATTEMPTS", 5)
        self.lock_seconds = _int("LOCK_SECONDS", 900)
        self.signup_token_ttl_seconds = _int("SIGNUP_TOKEN_TTL_SECONDS", 900)
        # 관리자가 회의실을 차단하면 이 시간 동안 이용할 수 없다
        self.room_block_minutes = _int("ROOM_BLOCK_MINUTES", 60)

        self.redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
        self.redis_port = _int("REDIS_PORT", 6379)
        self.redis_password = os.environ.get("REDIS_PASSWORD") or None
        self.redis_db = _int("REDIS_DB", 0)
        self.notification_retention_limit = _int("NOTIFICATION_RETENTION_LIMIT", 100)

    @property
    def database_url(self) -> URL:
        if os.environ.get("DATABASE_URL"):
            return os.environ["DATABASE_URL"]
        return URL.create(
            "postgresql+psycopg",
            username=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            host="127.0.0.1",
            port=int(os.environ["POSTGRES_PORT"]),
            database=os.environ["POSTGRES_DB"],
        )

    def is_company_ip(self, ip: str) -> bool:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        for item in self.company_ips.split(","):
            item = item.strip()
            if item and addr in ipaddress.ip_network(item, strict=False):
                return True
        return False


settings = Settings()
