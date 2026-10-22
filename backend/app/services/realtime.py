"""WebSocket 접속자 관리와 서버 → 클라이언트 이벤트 전달.

전제: uvicorn 프로세스 1개. 접속자 목록이 이 프로세스 메모리에만 있으므로
워커를 여러 개 띄우면 다른 프로세스에 붙은 사용자에게는 이벤트가 가지 않는다.
여러 프로세스가 필요해지면 Redis pub/sub 같은 중계를 붙여야 한다.
"""

import asyncio
import concurrent.futures
import logging
from collections import defaultdict
from typing import Any, Iterable, Optional
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# 동기 코드가 전송 완료를 기다리는 최대 시간. 느린 소켓 때문에 HTTP 응답이 늦어지지 않게 한다
PUBLISH_WAIT_SECONDS = 1.0
# 소켓 하나에 보내는 최대 시간. 넘기면 끊긴 소켓으로 보고 명부에서 뺀다
SEND_TIMEOUT_SECONDS = 1.0


def event(type: str, data: Any = None) -> dict:
    """이벤트 형식 {"type", "data"}. data 가 없으면 {"type"} 만 보낸다(ready, pong)."""
    if data is None:
        return {"type": type}
    return {"type": type, "data": data}


class ConnectionManager:
    def __init__(self) -> None:
        # 한 사용자가 탭을 여러 개 열 수 있으므로 user_id → 소켓 여러 개
        self.connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        # 소켓이 붙어 있는 이벤트 루프. 연결 때 저장하고 동기 코드에서 이 루프로 넘긴다
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        """accept 가 끝난 소켓을 등록한다. 이벤트 루프 안에서 호출한다."""
        self.loop = asyncio.get_running_loop()
        self.connections[user_id].add(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        sockets = self.connections.get(user_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            del self.connections[user_id]

    def online(self, user_ids: Iterable[UUID]) -> list[UUID]:
        """지금 접속 중인 사용자만 고른다. 이벤트를 만들기 전에 불필요한 조회를 줄이는 용도."""
        return [uid for uid in user_ids if uid in self.connections]

    async def send(self, user_ids: Iterable[UUID], payload: dict) -> None:
        """접속 중인 사용자에게만 보낸다. 보내다 실패한 소켓은 명부에서 뺀다."""
        # 보내는 동안 명부가 바뀔 수 있으므로 대상을 먼저 복사한다
        targets = [
            (uid, ws) for uid in set(user_ids) for ws in list(self.connections.get(uid, ()))
        ]
        if not targets:
            return
        results = await asyncio.gather(
            *(asyncio.wait_for(ws.send_json(payload), SEND_TIMEOUT_SECONDS) for _, ws in targets),
            return_exceptions=True,
        )
        for (uid, ws), result in zip(targets, results):
            if isinstance(result, BaseException):
                self.disconnect(uid, ws)


manager = ConnectionManager()


def publish_to_users(user_ids: Iterable[UUID], payload: dict) -> None:
    """동기 코드(서비스, 스레드풀)에서 DB commit 후 호출한다. D(예약 알림)도 이 함수를 쓴다.

    어떤 경우에도 예외를 던지지 않는다. 전송 실패가 이미 저장된 데이터를 되돌리면 안 되기 때문이다.
    접속자가 없거나 루프가 아직 없으면 조용히 건너뛴다.
    """
    try:
        user_ids = set(user_ids)
        loop = manager.loop
        if loop is None or loop.is_closed() or not manager.online(user_ids):
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            # 이미 그 루프 안이면 결과를 기다리는 순간 교착되므로 예약만 한다
            loop.create_task(manager.send(user_ids, payload))
            return
        future = asyncio.run_coroutine_threadsafe(manager.send(user_ids, payload), loop)
        try:
            future.result(PUBLISH_WAIT_SECONDS)
        except concurrent.futures.TimeoutError:
            # 전송은 루프에서 계속된다. 호출한 쪽은 더 기다리지 않는다
            pass
    except Exception:
        logger.warning("Realtime publish failed", exc_info=True)
