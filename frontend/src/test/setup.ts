import "@testing-library/jest-dom/vitest";

// 채팅 패널이 로그인 상태에서 실시간 연결(/api/ws)을 연다. 테스트에서는 실제 네트워크에 붙지 않도록
// 아무 일도 하지 않는 WebSocket 을 기본으로 둔다. 실시간 동작을 확인하는 테스트는 vi.stubGlobal 로 바꿔 쓴다
class InertWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(public url: string) {}
  send() {}
  close() { this.readyState = 3; }
}
globalThis.WebSocket = InertWebSocket as unknown as typeof WebSocket;

// jsdom does not implement the native dialog top layer. Browser QA covers focus trapping.
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };
