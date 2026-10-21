"""실시간 이벤트용 WebSocket. 서버 → 클라이언트 push 전용이고 클라이언트는 ping 만 보낸다."""

from fastapi import APIRouter, WebSocket

router = APIRouter(prefix="/api", tags=["ws"])

# 로그인 안 됨·만료·로그아웃
CLOSE_UNAUTHORIZED = 4401
# 허용하지 않은 Origin (쿠키 인증이라 CSWSH 방어)
CLOSE_FORBIDDEN_ORIGIN = 4403


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Origin 이 settings.origins 에 없으면 close(CLOSE_FORBIDDEN_ORIGIN)
    # 2. 쿠키 settings.cookie_name 으로
    #    await run_in_threadpool(websocket_user_id, token) → None 이면 close(CLOSE_UNAUTHORIZED)
    #    참고: accept 전에 close 하면 브라우저는 코드 없이 연결 실패로만 본다.
    #    프런트가 4401 을 구분해야 하면 accept 후 close 한다
    # 3. accept → realtime.manager.connect(user_id, websocket) → {"type": "ready"}
    # 4. receive_json 루프: {"type": "ping"} 이면 세션 재확인 → 실패 시 4401, 성공 시 pong
    # 5. WebSocketDisconnect (finally) → realtime.manager.disconnect(user_id, websocket)
    # TODO
    raise NotImplementedError
