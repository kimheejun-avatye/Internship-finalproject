import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setCsrfToken } from "../../shared/api/session-client";
import { createLiveChat } from "./chat.live";
import { CLOSE_UNAUTHORIZED, PING_INTERVAL_MS } from "./chat.realtime";
import type { ChatData, MessageDto, RoomDetailDto } from "./chat.types";

const me = { user_id: "me", name: "나", email: "me@example.com", team: "AVATYE" as const };
const kim = { user_id: "kim", name: "김민수", email: "kim@example.com", team: "AVATYE" as const };
const room: RoomDetailDto = {
  chat_room_id: "room-1", type: "DIRECT", title: null, display_title: "김민수", member_count: 2,
  last_message: null, last_activity_at: "2026-10-22T01:00:00Z", created_at: "2026-10-22T01:00:00Z",
  members: [{ user_id: "kim", name: "김민수" }],
};
const message = (id: string, at: string, extra: Partial<MessageDto> = {}): MessageDto => ({
  message_id: id, chat_room_id: "room-1", user_id: "kim", sender: { user_id: "kim", name: "김민수" },
  message: "메시지 " + id, created_at: at, client_id: null, ...extra,
});

// 서버 대신 이벤트를 직접 흘려보낼 수 있는 WebSocket
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; }
  ready() { this.onopen?.(); this.emit({ type: "ready" }); }
  emit(event: unknown) { this.onmessage?.({ data: JSON.stringify(event) }); }
  drop(code: number) { this.onclose?.({ code }); }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Route = (path: string, init?: RequestInit) => Response | Promise<Response> | undefined;
let fetch: ReturnType<typeof vi.fn>;
function serve(...routes: Route[]) {
  fetch = vi.fn(async (path: string, init?: RequestInit) => {
    for (const route of routes) {
      const response = await route(path, init);
      if (response) return response;
    }
    if (path.startsWith("/api/users/search?")) return json({ items: [kim], next_cursor: null });
    if (path.startsWith("/api/chat/rooms?")) return json({ items: [room], next_cursor: null });
    if (path === "/api/chat/rooms/room-1") return json(room);
    if (path.startsWith("/api/chat/rooms/room-1/messages?")) return json({ items: [], next_cursor: null });
    throw new Error("Unexpected request " + path);
  });
  vi.stubGlobal("fetch", fetch);
}
const calls = (part: string) => fetch.mock.calls.filter(([path]) => String(path).includes(part));
const body = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

let data: ChatData;
beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  setCsrfToken("csrf");
});
afterEach(() => {
  data?.disconnect?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setCsrfToken("");
});

async function openConnected() {
  data = createLiveChat(me);
  data.connect!();
  await vi.waitFor(() => expect(data.getSnapshot().rooms).toHaveLength(1));
  FakeSocket.all[0].ready();
  data.openRoom("room-1", "rooms");
  await vi.waitFor(() => expect(data.getSnapshot().messages["room-1"]).toBeDefined());
  return FakeSocket.all[0];
}

it("loads friends and rooms, then opens a single realtime connection", async () => {
  serve();
  const socket = await openConnected();
  const state = data.getSnapshot();
  expect(state.users.map(u => u.name)).toEqual(["김민수"]);
  expect(state.rooms[0]).toMatchObject({ display_title: "김민수", members: [{ name: "김민수" }] });
  expect(FakeSocket.all).toHaveLength(1);
  expect(socket.url).toMatch(/\/api\/ws$/);
});

it("shows a pending message and keeps one copy when WS echo arrives before the HTTP response", async () => {
  let finish!: (response: Response) => void;
  serve((path, init) => init?.method === "POST" && path === "/api/chat/rooms/room-1/messages"
    ? new Promise<Response>(resolve => { finish = resolve; }) : undefined);
  const socket = await openConnected();
  data.setDraft("room-1", "  안녕하세요  ");

  const sending = data.sendMessage("room-1", "  안녕하세요  ");
  const [pending] = data.getSnapshot().messages["room-1"];
  expect(pending).toMatchObject({ message: "안녕하세요", presentation: { pending: true } });
  expect(data.getSnapshot().drafts["room-1"]).toBe("");
  await vi.waitFor(() => expect(calls("/messages").filter(c => (c[1] as RequestInit)?.method === "POST")).toHaveLength(1));
  const clientId = body(calls("/messages").find(c => (c[1] as RequestInit)?.method === "POST")!).client_id;
  expect(clientId).toBe(pending.client_id);

  // WS 이벤트가 먼저 와서 임시 메시지를 바꾸고, 늦게 온 HTTP 응답은 같은 message_id 라 겹치지 않는다
  const saved = message("m-1", "2026-10-22T02:00:00Z", { user_id: "me", sender: { user_id: "me", name: "나" }, message: "안녕하세요", client_id: clientId });
  socket.emit({ type: "message.created", data: saved });
  expect(data.getSnapshot().messages["room-1"].map(m => m.message_id)).toEqual(["m-1"]);
  finish(json(saved, 201));
  await sending;
  expect(data.getSnapshot().messages["room-1"].map(m => m.message_id)).toEqual(["m-1"]);
  expect(data.getSnapshot().rooms[0].last_message?.message_id).toBe("m-1");
});

it("removes the pending message and restores the draft when sending fails", async () => {
  serve((path, init) => init?.method === "POST" && path.endsWith("/messages")
    ? json({ detail: { code: "CHAT_ROOM_NOT_FOUND", message: "채팅방을 찾을 수 없습니다." } }, 404) : undefined);
  await openConnected();
  await expect(data.sendMessage("room-1", "다시 보낼 내용")).rejects.toThrow("채팅방을 찾을 수 없습니다.");
  expect(data.getSnapshot().messages["room-1"]).toEqual([]);
  expect(data.getSnapshot().drafts["room-1"]).toBe("다시 보낼 내용");
});

it("creates a direct room for one member and a group with an automatic title for several", async () => {
  const group = { ...room, chat_room_id: "room-2", type: "GROUP", display_title: "김민수, 이영희", member_count: 3 };
  serve(path => path === "/api/chat/rooms/direct" ? json(room) : path === "/api/chat/rooms/group" ? json(group, 201) : undefined);
  data = createLiveChat(me);
  expect(await data.createRoom(["kim", "kim"])).toBe("room-1");
  expect(body(calls("/direct")[0])).toEqual({ target_user_id: "kim" });
  expect(await data.createRoom(["kim", "lee"], "   ")).toBe("room-2");
  expect(body(calls("/group")[0])).toEqual({ title: null, member_ids: ["kim", "lee"] });
  expect(data.getSnapshot().rooms.map(r => r.chat_room_id)).toEqual(["room-1", "room-2"]);
});

it("applies room.updated without losing members and loads older pages by cursor", async () => {
  serve(path => {
    if (path === "/api/chat/rooms/room-1/messages?limit=30") return json({ items: [message("m-3", "2026-10-22T03:00:00Z")], next_cursor: "older" });
    if (path === "/api/chat/rooms/room-1/messages?limit=30&cursor=older") return json({ items: [message("m-1", "2026-10-22T01:30:00Z")], next_cursor: null });
    return undefined;
  });
  const socket = await openConnected();
  expect(data.getSnapshot().history?.["room-1"]).toBe("older");

  socket.emit({ type: "room.updated", data: { ...room, members: undefined, display_title: "김민수", last_activity_at: "2026-10-22T03:00:00Z" } });
  expect(data.getSnapshot().rooms[0].members).toEqual([{ user_id: "kim", name: "김민수" }]);

  await data.loadOlder!("room-1");
  expect(data.getSnapshot().messages["room-1"].map(m => m.message_id)).toEqual(["m-1", "m-3"]);
  expect(data.getSnapshot().history?.["room-1"]).toBeNull();
});

it("pings, reconnects and refetches after a drop, but asks to log in again on 4401", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  serve();
  const socket = await openConnected();
  vi.advanceTimersByTime(PING_INTERVAL_MS);
  expect(socket.sent).toEqual([JSON.stringify({ type: "ping" })]);

  const roomCalls = calls("/api/chat/rooms?").length;
  socket.drop(1006);
  vi.advanceTimersByTime(1_000);
  expect(FakeSocket.all).toHaveLength(2);
  FakeSocket.all[1].ready();
  await vi.waitFor(() => expect(calls("/api/chat/rooms?").length).toBe(roomCalls + 1));

  const lost = vi.fn();
  window.addEventListener("auth:lost", lost);
  FakeSocket.all[1].drop(CLOSE_UNAUTHORIZED);
  vi.advanceTimersByTime(30_000);
  window.removeEventListener("auth:lost", lost);
  expect(lost).toHaveBeenCalledTimes(1);
  expect(FakeSocket.all).toHaveLength(2);
});
