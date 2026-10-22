export type RealtimeEvent = { type: string; data?: unknown };
export type RealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting" | "stopped";
export const PING_INTERVAL_MS = 25_000;
export const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN_ORIGIN = 4403;
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const MAX_HANDSHAKE_FAILURES = 5;

type Listener = (event: RealtimeEvent) => void;
const listeners = new Set<Listener>();
const statusListeners = new Set<(status: RealtimeStatus) => void>();
let status: RealtimeStatus = "idle";
let stopCurrent: (() => void) | null = null;

function deliver(listener: Listener, event: RealtimeEvent) {
  // 한 기능의 잘못된 이벤트 처리가 다른 구독자나 공통 소켓을 중단시키지 않게 격리한다.
  try { listener(event); } catch { /* 해당 기능이 다음 정상 이벤트를 계속 받을 수 있게 한다. */ }
}

function setStatus(next: RealtimeStatus) {
  status = next;
  for (const listener of statusListeners) listener(next);
}

export function subscribeRealtime(listener: Listener) {
  listeners.add(listener);
  // 화면이 나중에 구독해도 이미 준비된 연결을 재사용하며 새 소켓을 만들지 않는다.
  if (status === "connected") queueMicrotask(() => {
    if (listeners.has(listener) && status === "connected") deliver(listener, { type: "ready" });
  });
  return () => { listeners.delete(listener); };
}

export function subscribeRealtimeStatus(listener: (value: RealtimeStatus) => void) {
  statusListeners.add(listener);
  listener(status);
  return () => { statusListeners.delete(listener); };
}

export function startRealtime(onAuthLost: () => void) {
  // 인증 범위가 소켓 하나를 소유한다. 채팅·알림은 구독만 하므로 페이지 이동으로 연결이 늘지 않는다.
  stopCurrent?.();
  let stopped = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let handshake: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let handshakeFailures = 0;

  function clearTimers() {
    clearTimeout(retry);
    clearTimeout(handshake);
    clearInterval(ping);
  }
  function stop() {
    stopped = true;
    clearTimers();
    if (socket) {
      // 계정 전환 뒤 도착하는 이전 소켓의 메시지·종료 콜백이 새 사용자를 건드리지 않게 한다.
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
      socket = null;
    }
    if (stopCurrent === stop) { stopCurrent = null; setStatus("idle"); }
  }
  stopCurrent = stop;

  function connect() {
    if (stopped) return;
    setStatus(attempts ? "reconnecting" : "connecting");
    let current: WebSocket;
    try {
      // 현재 Origin의 쿠키를 그대로 사용하고 HTTPS 배포에서는 암호화된 wss로 접속한다.
      current = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/ws`);
    } catch {
      stop(); setStatus("stopped"); return;
    }
    socket = current;
    let ready = false;
    let lastPong = Date.now();
    handshake = setTimeout(() => current.close(4000, "Ready timeout"), 15_000);
    current.onopen = () => {
      if (stopped || socket !== current) return;
      // 서버의 60초 유휴 종료보다 짧게 ping하되 HTTP 활동 API를 호출해 세션을 연장하지 않는다.
      ping = setInterval(() => {
        if (stopped || socket !== current || current.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastPong >= 60_000) { current.close(4000, "Pong timeout"); return; }
        current.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL_MS);
    };
    current.onmessage = message => {
      if (stopped || socket !== current || typeof message.data !== "string") return;
      let event: unknown;
      try { event = JSON.parse(message.data); } catch { return; }
      if (!event || typeof event !== "object" || Array.isArray(event) || !("type" in event) || typeof event.type !== "string") return;
      const received = event as RealtimeEvent;
      if (received.type === "ready") {
        ready = true; lastPong = Date.now(); attempts = 0; handshakeFailures = 0;
        clearTimeout(handshake); setStatus("connected");
      } else if (received.type === "pong") lastPong = Date.now();
      // 전송 계층은 이벤트를 분배하고 각 기능이 자기 type과 data 계약만 검증한다.
      for (const listener of listeners) deliver(listener, received);
    };
    current.onclose = event => {
      if (stopped || socket !== current) return;
      clearTimers(); socket = null;
      if (event.code === CLOSE_UNAUTHORIZED) {
        stop(); onAuthLost(); return;
      }
      // Origin 거절은 accept 전 종료되어 브라우저에 1006으로 보일 수도 있어 ready 전 실패도 제한한다.
      if (!ready) handshakeFailures += 1;
      if ([CLOSE_FORBIDDEN_ORIGIN, 1008].includes(event.code) || handshakeFailures >= MAX_HANDSHAKE_FAILURES) {
        stop(); setStatus("stopped"); return;
      }
      setStatus("reconnecting");
      const delay = RETRY_DELAYS_MS[Math.min(attempts++, RETRY_DELAYS_MS.length - 1)];
      retry = setTimeout(connect, delay);
    };
  }

  // StrictMode의 첫 정리 단계에서 예약을 취소할 수 있어 개발 중에도 중복 연결을 만들지 않는다.
  retry = setTimeout(connect, 0);
  return stop;
}

if (import.meta.hot) import.meta.hot.dispose(() => stopCurrent?.());
