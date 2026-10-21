"""WebSocket 접속자 관리와 서버 → 클라이언트 이벤트 전달.

전제: uvicorn 프로세스 1개. 접속자 목록이 이 프로세스 메모리에만 있으므로
워커를 여러 개 띄우면 다른 프로세스에 붙은 사용자에게는 이벤트가 가지 않는다.
여러 프로세스가 필요해지면 Redis pub/sub 같은 중계를 붙여야 한다.
"""

import asyncio
from collections import defaultdict
from typing import Any, Iterable, Optional
from uuid import UUID

from fastapi import WebSocket


def event(type: str, data: Any = None) -> dict:
    """이벤트 형식은 모두 {"type", "data"}. data 는 JSON 으로 바로 보낼 수 있는 값이어야 한다."""
    return {"type": type, "data": data}


class ConnectionManager:
    def __init__(self) -> None:
        # 한 사용자가 탭을 여러 개 열 수 있으므로 user_id → 소켓 여러 개
        self.connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        # 소켓이 붙어 있는 이벤트 루프. 첫 연결 때 저장하고 동기 코드에서 이 루프로 넘긴다
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        """accept 가 끝난 소켓을 등록한다. 이벤트 루프 안에서 호출한다."""
        # TODO: self.loop = asyncio.get_running_loop(), connections 에 추가
        raise NotImplementedError

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        """소켓을 등록 해제한다. 빈 set 은 지운다."""
        # TODO
        raise NotImplementedError

    async def send(self, user_ids: Iterable[UUID], payload: dict) -> None:
        """접속 중인 사용자에게만 보낸다. 보내다 실패한 소켓은 정리한다."""
        # TODO: 순회 중 set 이 바뀌지 않도록 복사본으로 돈다
        raise NotImplementedError


manager = ConnectionManager()


def publish_to_users(user_ids: Iterable[UUID], payload: dict) -> None:
    """동기 코드(서비스, 스레드풀)에서 호출한다. D(예약 알림)도 이 함수를 import 해서 쓴다.

    - 접속자가 없거나 루프가 아직 없으면 조용히 건너뛴다
    - 다른 스레드: asyncio.run_coroutine_threadsafe(manager.send(...), manager.loop)
    - 이미 그 루프 안이면: loop.create_task(...) (결과를 기다리면 교착)
    """
    # TODO
    raise NotImplementedError
