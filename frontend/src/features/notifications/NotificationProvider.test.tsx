import { useRef } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RealtimeProvider } from "../../shared/realtime/RealtimeProvider";
import { setCsrfToken } from "../../shared/api/session-client";
import { NotificationProvider } from "./NotificationProvider";
import NotificationPanel from "./components/NotificationPanel";

const notification = {
  notification_id: "00000000-0000-0000-0000-000000000001",
  reservation_id: "00000000-0000-0000-0000-000000000002",
  type: "reservation.created", title: "기획 회의", room_name: "회의실 A",
  start_at: "2026-10-23T01:00:00Z", end_at: "2026-10-23T02:00:00Z",
  created_at: "2026-10-22T01:00:00Z", message: "회의 참석 안내", read_at: null,
};
const readAt = "2026-10-22T02:00:00Z";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const history = (items: unknown[]) => json({ items, retention_limit: 100 });

class Socket {
  static instances: Socket[] = [];
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { Socket.instances.push(this); }
  send() {}
  close() { this.readyState = 3; }
  receive(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

function Screen({ userId = "user-a" }: { userId?: string | null }) {
  const anchor = useRef<HTMLButtonElement>(null);
  return <MemoryRouter><RealtimeProvider key={userId} userId={userId} onAuthLost={() => {}}>
    <NotificationProvider userId={userId}>
      <button ref={anchor}>알림 열기</button>
      <NotificationPanel id="notifications" anchorRef={anchor} onNavigate={() => {}} />
    </NotificationProvider>
  </RealtimeProvider></MemoryRouter>;
}

beforeEach(() => {
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  setCsrfToken("csrf-test");
});
afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(""); });

it("loads saved notifications with their read state on login and after refresh", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => history([{ ...notification, read_at: readAt }])));
  const first = render(<Screen />);
  expect(await screen.findByText("기획 회의")).toBeInTheDocument();
  expect(screen.getByText("읽음", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("새 알림 0")).toBeInTheDocument();
  first.unmount();
  render(<Screen />);
  expect(await screen.findByText("읽음", { exact: true })).toBeInTheDocument();
});

it("persists a clicked notification and restores the saved state after remount", async () => {
  let savedReadAt: string | null = null;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    if (init.method === "PATCH") {
      expect(path).toBe(`/api/notifications/${notification.notification_id}/read`);
      expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-test");
      savedReadAt = readAt;
      return json({ notification_id: notification.notification_id, read_at: readAt });
    }
    return history([{ ...notification, read_at: savedReadAt }]);
  }));
  const first = render(<Screen />);
  await userEvent.click(await screen.findByRole("link", { name: /기획 회의/ }));
  expect(await screen.findByText("읽음", { exact: true })).toBeInTheDocument();
  first.unmount();
  render(<Screen />);
  expect(await screen.findByText("읽음", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("새 알림 0")).toBeInTheDocument();
});

it("reloads history when the socket becomes ready and merges live notifications without duplicates", async () => {
  let stored: unknown[] = [];
  const fetch = vi.fn(async () => history(stored));
  vi.stubGlobal("fetch", fetch);
  render(<Screen />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  stored = [{ ...notification, read_at: readAt }];
  await act(async () => Socket.instances[0].receive({ type: "ready" }));
  expect(await screen.findByText("기획 회의")).toBeInTheDocument();
  await act(async () => Socket.instances[0].receive({ type: "notification.created", data: notification }));
  expect(screen.getAllByRole("link", { name: /기획 회의/ })).toHaveLength(1);
  expect(screen.getByText("읽음", { exact: true })).toBeInTheDocument();
});

it("keeps a live notification received while the initial history request is pending", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  render(<Screen />);
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  await act(async () => Socket.instances[0].receive({ type: "notification.created", data: notification }));
  expect(await screen.findByText("기획 회의")).toBeInTheDocument();
  await act(async () => finish(history([])));
  expect(screen.getByText("기획 회의")).toBeInTheDocument();
});

it("keeps an unsuccessful read unread and retries on the next click without adding error UI", async () => {
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    if (init.method === "PATCH") return fail
      ? json({ detail: { code: "NOTIFICATION_STORE_UNAVAILABLE", message: "읽음 상태 저장 실패" } }, 503)
      : json({ notification_id: notification.notification_id, read_at: readAt });
    return history([notification]);
  }));
  render(<Screen />);
  const link = await screen.findByRole("link", { name: /기획 회의/ });
  await userEvent.click(link);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  expect(screen.getByText("안 읽음", { exact: true })).toBeInTheDocument();
  fail = false;
  await userEvent.click(link);
  expect(await screen.findByText("읽음", { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps the original panel on history failure and reloads automatically on ready", async () => {
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async () => fail
    ? json({ detail: { code: "NOTIFICATION_STORE_UNAVAILABLE", message: "알림 조회 실패" } }, 503)
    : history([notification])));
  render(<Screen />);
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  fail = false;
  await act(async () => Socket.instances[0].receive({ type: "ready" }));
  expect(await screen.findByText("기획 회의")).toBeInTheDocument();
});

it("ignores an earlier accounts pending response after switching accounts", async () => {
  let finishOld!: (response: Response) => void;
  let current = "user-a";
  vi.stubGlobal("fetch", vi.fn(() => current === "user-a"
    ? new Promise<Response>(resolve => { finishOld = resolve; })
    : Promise.resolve(history([]))));
  const page = render(<Screen userId="user-a" />);
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  current = "user-b";
  page.rerender(<Screen userId="user-b" />);
  await act(async () => finishOld(history([notification])));
  expect(screen.queryByText("기획 회의")).not.toBeInTheDocument();
});

it("retrieves an invitation missed during a socket disconnect", async () => {
  let stored: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async () => history(stored)));
  render(<Screen />);
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  await act(async () => Socket.instances[0].receive({ type: "ready" }));
  stored = [notification];
  act(() => Socket.instances[0].onclose?.({ code: 1006 }));
  await waitFor(() => expect(Socket.instances).toHaveLength(2), { timeout: 2500 });
  await act(async () => Socket.instances[1].receive({ type: "ready" }));
  expect(await screen.findByText("기획 회의")).toBeInTheDocument();
});

it("keeps a confirmed read when an older history response arrives later", async () => {
  let resolveHistory!: (response: Response) => void;
  let historyCalls = 0;
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
    if (init.method === "PATCH") return json({ notification_id: notification.notification_id, read_at: readAt });
    if (++historyCalls === 1) return history([notification]);
    return new Promise<Response>(resolve => { resolveHistory = resolve; });
  }));
  render(<Screen />);
  await screen.findByRole("link", { name: /기획 회의/ });
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  await act(async () => Socket.instances[0].receive({ type: "ready" }));
  await userEvent.click(screen.getByRole("link", { name: /기획 회의/ }));
  expect(await screen.findByText("읽음", { exact: true })).toBeInTheDocument();
  await act(async () => resolveHistory(history([notification])));
  expect(screen.getByText("읽음", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("새 알림 0")).toBeInTheDocument();
});

it("removes the oldest displayed notification when a live event exceeds server retention", async () => {
  const newer = { ...notification, notification_id: "00000000-0000-0000-0000-000000000003", title: "두 번째 회의", created_at: "2026-10-22T02:00:00Z" };
  const newest = { ...notification, notification_id: "00000000-0000-0000-0000-000000000004", title: "세 번째 회의", created_at: "2026-10-22T03:00:00Z" };
  vi.stubGlobal("fetch", vi.fn(async () => json({ items: [newer, notification], retention_limit: 2 })));
  render(<Screen />);
  await screen.findByText("기획 회의");
  await waitFor(() => expect(Socket.instances).toHaveLength(1));
  await act(async () => Socket.instances[0].receive({ type: "notification.created", data: newest }));
  expect(screen.queryByText("기획 회의")).not.toBeInTheDocument();
  expect(screen.getByText("새 알림 2")).toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(2);
});
