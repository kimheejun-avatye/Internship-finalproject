"""알림 저장에 사용하는 동기 Redis 클라이언트."""

from functools import lru_cache

from redis import Redis

from app.core.config import settings


@lru_cache(maxsize=1)
def get_redis_client() -> Redis:
    return Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        password=settings.redis_password,
        db=settings.redis_db,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
    )
