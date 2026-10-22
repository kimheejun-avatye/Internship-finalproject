import type { MessageDto, RoomSummaryDto } from "./chat.types";

// 서버 → 클라이언트 실시간 이벤트. 연결 규칙은 백엔드 routes/ws.py 와 같다
export type ChatEvent =
  | { type: "ready" }
  | { type: "pong" }
  | { type: "message.created"; data: MessageDto }
  | { type: "room.updated"; data: RoomSummaryDto }
  | { type: "notification.created"; data: unknown };

// 서버는 60초 동안 아무것도 오지 않으면 연결을 닫는다(4408)
export const PING_INTERVAL_MS = 25_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];
// 로그인 만료·로그아웃. 다시 연결해도 소용없으므로 재로그인을 알린다
export const CLOSE_UNAUTHORIZED = 4401;

type Options = {
  onEvent: (event: ChatEvent) => void;
  // 연결될 때마다(재연결 포함) 부른다
  onReady: () => void;
  onAuthLost: () => void;
  url?: string;
};

function defaultUrl() {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`;
}

// 연결을 열고 끊기면 다시 연결한다. 돌려준 함수를 부르면 완전히 닫는다
export function openRealtime({ onEvent, onReady, onAuthLost, url = defaultUrl() }: Options) {
  let socket: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let stopped = false;

  function connect() {
    const current = new WebSocket(url);
    socket = current;
    current.onopen = () => {
      ping = setInterval(() => current.send(JSON.stringify({ type: "ping" })), PING_INTERVAL_MS);
    };
    current.onmessage = message => {
      let event: ChatEvent;
      try { event = JSON.parse(String(message.data)); } catch { return; }
      if (event.type === "ready") { attempts = 0; onReady(); return; }
      onEvent(event);
    };
    current.onclose = event => {
      clearInterval(ping);
      if (socket === current) socket = null;
      if (stopped) return;
      if (event.code === CLOSE_UNAUTHORIZED) { onAuthLost(); return; }
      const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
      attempts += 1;
      retry = setTimeout(connect, delay);
    };
  }

  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(ping);
    socket?.close();
    socket = null;
  };
}
