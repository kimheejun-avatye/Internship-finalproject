"""채팅 QA 페이지를 띄우고 /api 요청(WebSocket 포함)을 백엔드로 넘기는 개발용 서버.

브라우저 → http://127.0.0.1:5174 (이 서버) → http://127.0.0.1:8000 (백엔드)

페이지와 API 가 같은 출처라서 세션 쿠키·CSRF·Origin 검사가 실제 화면과 똑같이 동작한다.
127.0.0.1:5174 와 localhost:5174 는 쿠키가 따로라서 두 창에서 서로 다른 사용자로 로그인할 수 있다.

backend 폴더에서 실행한다. 백엔드(uvicorn app.main:app --port 8000)는 따로 띄운다.

    python -m uvicorn scripts.chat_qa.proxy:app --port 5174
"""

import asyncio
import os
from pathlib import Path

import httpx
import websockets
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, Response
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket, WebSocketDisconnect

BACKEND = os.environ.get("CHAT_QA_BACKEND", "http://127.0.0.1:8000")
PAGE = Path(__file__).with_name("index.html")
# 요청·응답을 그대로 옮길 때 빼야 하는 연결 단위 헤더
HOP_HEADERS = {
    "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
    "content-length", "content-encoding",
}

# 쿠키 저장소를 쓰지 않도록 요청을 직접 만들어 send 한다(build_request 를 거치면 사용자끼리 쿠키가 섞인다)
client = httpx.AsyncClient(timeout=30)


async def page(request: Request):
    return FileResponse(PAGE, headers={"Cache-Control": "no-store"})


async def api(request: Request):
    headers = [(k, v) for k, v in request.headers.items() if k.lower() not in HOP_HEADERS]
    upstream = await client.send(
        httpx.Request(
            request.method,
            BACKEND + request.url.path,
            params=request.query_params,
            headers=headers,
            content=await request.body(),
        )
    )
    response = Response(upstream.content, status_code=upstream.status_code)
    for key, value in upstream.headers.multi_items():
        if key.lower() not in HOP_HEADERS:
            response.headers.append(key, value)
    return response


async def ws(websocket: WebSocket):
    url = BACKEND.replace("http", "ws", 1) + websocket.url.path
    extra = {"Cookie": websocket.headers["cookie"]} if "cookie" in websocket.headers else {}
    try:
        upstream = await websockets.connect(
            url, origin=websocket.headers.get("origin"), additional_headers=extra
        )
    except websockets.InvalidStatus:
        # 백엔드가 accept 전에 거절했다(Origin). 브라우저에도 accept 없이 끊는다
        await websocket.close(code=4403)
        return
    await websocket.accept()

    async def browser_to_backend():
        try:
            while True:
                await upstream.send(await websocket.receive_text())
        except WebSocketDisconnect:
            await upstream.close()

    async def backend_to_browser():
        try:
            async for message in upstream:
                await websocket.send_text(message)
        except websockets.ConnectionClosed:
            pass
        # 백엔드가 보낸 종료 코드(4401·4408 등)를 브라우저에 그대로 전달한다
        code = upstream.close_code or 1000
        try:
            await websocket.close(code=code if code not in (1005, 1006) else 1000)
        except RuntimeError:
            pass

    tasks = [asyncio.ensure_future(browser_to_backend()), asyncio.ensure_future(backend_to_browser())]
    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in tasks:
        task.cancel()
    await upstream.close()


app = Starlette(
    routes=[
        Route("/", page),
        WebSocketRoute("/api/ws", ws),
        Route("/api/{path:path}", api, methods=["GET", "POST", "PUT", "PATCH", "DELETE"]),
    ]
)
