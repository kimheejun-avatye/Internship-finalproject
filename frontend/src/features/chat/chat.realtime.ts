import { subscribeRealtime } from "../../shared/realtime/realtime";
import type { MessageDto, RoomSummaryDto } from "./chat.types";
export { CLOSE_UNAUTHORIZED, PING_INTERVAL_MS } from "../../shared/realtime/realtime";

export type ChatEvent =
  | { type: "ready" }
  | { type: "pong" }
  | { type: "message.created"; data: MessageDto }
  | { type: "room.updated"; data: RoomSummaryDto }
  | { type: "notification.created"; data: unknown };

type Options = {
  onEvent: (event: ChatEvent) => void;
  onReady: () => void;
};

export function openRealtime({ onEvent, onReady }: Options) {
  // 기존 채팅 이벤트 처리는 유지하고 소켓은 알림과 공유한다. 인증 종료는 공통 Provider가 한 번 처리한다.
  return subscribeRealtime(event => {
    if (event.type === "ready") { onReady(); return; }
    if (event.type === "pong") { onEvent({ type: "pong" }); return; }
    if ((event.type === "message.created" || event.type === "room.updated") && event.data && typeof event.data === "object") {
      onEvent(event as ChatEvent);
    }
  });
}
