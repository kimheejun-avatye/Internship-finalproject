"""실시간 이벤트용 WebSocket. 서버 → 클라이언트 push 전용이고 클라이언트는 ping 만 보낸다."""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import websocket_user_id
from app.core.config import settings
from app.services.realtime import event, manager

router = APIRouter(prefix="/api", tags=["ws"])

# 로그인 안 됨·만료·로그아웃
CLOSE_UNAUTHORIZED = 4401
# 허용하지 않은 Origin (쿠키 인증이라 CSWSH 방어)
CLOSE_FORBIDDEN_ORIGIN = 4403
# 클라이언트가 한동안 아무것도 보내지 않음
CLOSE_IDLE_TIMEOUT = 4408

# 클라이언트는 25초마다 ping 을 보낸다. 이 시간 동안 아무것도 오지 않으면 끊긴 연결로 보고 닫는다
IDLE_TIMEOUT_SECONDS = 60


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 다른 사이트의 연결은 정상 화면이 아니므로 accept 전에 끊는다
    if websocket.headers.get("origin") not in settings.origins:
        await websocket.close(code=CLOSE_FORBIDDEN_ORIGIN)
        return

    token = websocket.cookies.get(settings.cookie_name, "")
    user_id = await run_in_threadpool(websocket_user_id, token)
    # 세션 만료는 정상 화면에서도 생기므로 accept 후 닫아 브라우저가 4401 을 볼 수 있게 한다
    await websocket.accept()
    if user_id is None:
        await websocket.close(code=CLOSE_UNAUTHORIZED)
        return

    manager.connect(user_id, websocket)
    try:
        await websocket.send_json(event("ready"))
        while True:
            try:
                received = await asyncio.wait_for(websocket.receive(), IDLE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                await websocket.close(code=CLOSE_IDLE_TIMEOUT)
                return
            if received["type"] == "websocket.disconnect":
                return
            if not _is_ping(received.get("text")):
                # 클라이언트는 ping 만 보낸다. 나머지는 무시한다
                continue
            # ping 마다 세션을 다시 확인한다. 소켓이 로그인을 연장하면 안 되므로 touch 하지 않는다
            if await run_in_threadpool(websocket_user_id, token) != user_id:
                await websocket.close(code=CLOSE_UNAUTHORIZED)
                return
            await websocket.send_json(event("pong"))
    except WebSocketDisconnect:
        # 보내는 도중 클라이언트가 끊었다
        pass
    finally:
        manager.disconnect(user_id, websocket)


def _is_ping(text):
    try:
        message = json.loads(text) if text else None
    except ValueError:
        return False
    return isinstance(message, dict) and message.get("type") == "ping"
