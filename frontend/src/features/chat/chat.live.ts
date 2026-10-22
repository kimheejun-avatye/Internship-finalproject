import { ApiError } from "../../shared/api/session-client";
import { getSelectableUsersPage } from "../../shared/api/users";
import * as api from "./chat.api";
import { openRealtime, type ChatEvent } from "./chat.realtime";
import type { ChatData, ChatMessage, ChatRoom, ChatSnapshot, ChatUser, MessageDto, RoomSummaryDto } from "./chat.types";

const LOAD_ERROR = "채팅 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
// 재연결 후 놓친 메시지를 찾을 때 최대로 거슬러 올라갈 페이지 수
const CATCH_UP_PAGES = 10;

const errorMessage = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;
const newClientId = () => globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const byTime = (a: ChatMessage, b: ChatMessage) => a.created_at.localeCompare(b.created_at) || a.message_id.localeCompare(b.message_id);

// 목록(summary)에는 참여자가 없으므로 이미 받은 참여자를 유지한다. 상세(detail)를 받으면 덮어쓴다
function toRoom(dto: RoomSummaryDto, existing?: ChatRoom): ChatRoom {
  return { members: existing?.members ?? [], ...dto };
}

// HTTP 응답과 WS 이벤트가 둘 다 오므로 message_id 로 중복을 없앤다.
// 화면에 먼저 띄운 임시 메시지는 client_id 가 같은 서버 메시지로 바꾼다
function mergeMessages(current: ChatMessage[] | undefined, incoming: MessageDto[]): ChatMessage[] {
  const byId = new Map((current ?? []).map(message => [message.message_id, message]));
  for (const message of incoming) {
    if (message.client_id) byId.delete(message.client_id);
    byId.set(message.message_id, message);
  }
  return [...byId.values()].sort(byTime);
}

// 메시지가 더 최신이면 방 목록의 마지막 메시지·활동 시각을 바꾼다 (WS 가 끊겨 있어도 목록이 맞도록)
function withLastMessage(rooms: ChatRoom[], message: MessageDto): ChatRoom[] {
  return rooms.map(room => room.chat_room_id === message.chat_room_id && message.created_at >= room.last_activity_at
    ? { ...room, last_message: { ...message, client_id: null }, last_activity_at: message.created_at }
    : room);
}

async function loadAll<T>(fetchPage: (cursor?: string) => Promise<api.Page<T>>): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    if (!page.next_cursor) return items;
    if (seen.has(page.next_cursor)) throw new Error("Repeated cursor");
    seen.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}

// 백엔드와 연결된 ChatData. 화면은 목업과 같은 인터페이스로 쓴다
export function createLiveChat(me: ChatUser): ChatData {
  let state: ChatSnapshot = {
    me, users: [], rooms: [], messages: {}, drafts: {}, history: {},
    screen: { kind: "friends" }, beforeCreate: { kind: "friends" },
  };
  const listeners = new Set<() => void>();
  const update = (change: (current: ChatSnapshot) => Partial<ChatSnapshot>) => {
    state = { ...state, ...change(state) };
    listeners.forEach(fn => fn());
  };
  let stopRealtime: (() => void) | null = null;
  let listsRequested = false;
  let everReady = false;

  const upsertRoom = (dto: RoomSummaryDto) => update(s => {
    const existing = s.rooms.find(room => room.chat_room_id === dto.chat_room_id);
    const room = toRoom(dto, existing);
    return { rooms: existing ? s.rooms.map(r => r === existing ? room : r) : [...s.rooms, room] };
  });

  async function refreshLists() {
    try {
      const [users, rooms] = await Promise.all([loadAll(getSelectableUsersPage), loadAll(api.listRooms)]);
      update(s => ({
        users,
        rooms: rooms.map(dto => toRoom(dto, s.rooms.find(room => room.chat_room_id === dto.chat_room_id))),
        error: undefined,
      }));
    } catch (error) {
      update(() => ({ error: errorMessage(error, LOAD_ERROR) }));
    }
  }

  // 처음 여는 방은 최신 한 페이지를, 이미 연 방은 가진 메시지가 나올 때까지 거슬러 올라가 빠진 메시지를 채운다
  async function syncMessages(roomId: string) {
    const first = !(roomId in state.messages);
    const known = new Set((state.messages[roomId] ?? []).map(message => message.message_id));
    const fresh: MessageDto[] = [];
    let cursor: string | undefined;
    let nextCursor: string | null = null;
    for (let page = 0; page < CATCH_UP_PAGES; page++) {
      const result = await api.listMessages(roomId, cursor);
      fresh.push(...result.items);
      nextCursor = result.next_cursor;
      if (first || !result.next_cursor || result.items.some(message => known.has(message.message_id))) break;
      cursor = result.next_cursor;
    }
    update(s => ({
      messages: { ...s.messages, [roomId]: mergeMessages(s.messages[roomId], fresh) },
      history: first ? { ...s.history, [roomId]: nextCursor } : s.history,
    }));
  }

  async function resync() {
    await refreshLists();
    for (const roomId of Object.keys(state.messages)) {
      try { await syncMessages(roomId); } catch { /* 방을 열 때 다시 시도한다 */ }
    }
  }

  function handle(event: ChatEvent) {
    if (event.type === "message.created") {
      const message = event.data;
      update(s => ({
        messages: message.chat_room_id in s.messages
          ? { ...s.messages, [message.chat_room_id]: mergeMessages(s.messages[message.chat_room_id], [message]) }
          : s.messages,
        rooms: withLastMessage(s.rooms, message),
      }));
    } else if (event.type === "room.updated") {
      upsertRoom(event.data);
    }
    // notification.created 는 알림 패널이 처리한다
  }

  return {
    mode: "api",
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    navigate: screen => update(s => ({ screen, ...(screen.kind === "create" && s.screen.kind !== "create" ? { beforeCreate: s.screen } : {}) })),
    cancelCreate: () => update(s => ({ screen: s.beforeCreate })),
    openRoom: (roomId, origin) => {
      update(() => ({ screen: { kind: "conversation", roomId, origin }, error: undefined }));
      void (async () => {
        try {
          const detail = await api.getRoom(roomId);
          upsertRoom(detail);
          await syncMessages(roomId);
        } catch (error) {
          // 나갔거나 삭제된 방: 목록에서 빼고 이전 화면으로 돌아간다
          if (error instanceof ApiError && error.status === 404) {
            update(s => ({ rooms: s.rooms.filter(room => room.chat_room_id !== roomId), screen: { kind: origin } }));
          }
          update(() => ({ error: errorMessage(error, "대화를 열지 못했습니다.") }));
        }
      })();
    },
    createRoom: async (memberIds, rawTitle = "") => {
      const ids = [...new Set(memberIds)];
      if (!ids.length) throw new Error("대화할 친구를 선택해 주세요.");
      const title = rawTitle.trim();
      if (ids.length > 1 && Array.from(title).length > 50) throw new Error("채팅방 이름은 50자까지 입력할 수 있습니다.");
      // 1명이면 1:1(기존 방 재사용), 2명 이상이면 그룹. 서버가 나를 자동으로 넣는다
      const detail = ids.length === 1 ? await api.openDirectRoom(ids[0]) : await api.createGroupRoom(ids, title || null);
      upsertRoom(detail);
      return detail.chat_room_id;
    },
    setDraft: (roomId, value) => update(s => ({ drafts: { ...s.drafts, [roomId]: value } })),
    sendMessage: async (roomId, rawText) => {
      const message = rawText.trim();
      if (!message || Array.from(message).length > 2000) throw new Error("메시지는 앞뒤 공백을 제거한 뒤 1~2,000자로 입력해 주세요.");
      const clientId = newClientId();
      const pending: ChatMessage = {
        message_id: clientId, chat_room_id: roomId, user_id: me.user_id, sender: { user_id: me.user_id, name: me.name },
        message, created_at: new Date().toISOString(), client_id: clientId, presentation: { pending: true },
      };
      update(s => ({ messages: { ...s.messages, [roomId]: [...(s.messages[roomId] ?? []), pending] }, drafts: { ...s.drafts, [roomId]: "" } }));
      try {
        const saved = await api.postMessage(roomId, message, clientId);
        update(s => ({ messages: { ...s.messages, [roomId]: mergeMessages(s.messages[roomId], [saved]) }, rooms: withLastMessage(s.rooms, saved) }));
      } catch (error) {
        // 보내지 못한 메시지는 지우고, 입력하던 내용을 되돌려 다시 보낼 수 있게 한다
        update(s => ({
          messages: { ...s.messages, [roomId]: (s.messages[roomId] ?? []).filter(m => m.message_id !== clientId) },
          drafts: { ...s.drafts, [roomId]: s.drafts[roomId] || rawText },
        }));
        throw error;
      }
    },
    loadOlder: async roomId => {
      const cursor = state.history?.[roomId];
      if (!cursor) return;
      const page = await api.listMessages(roomId, cursor);
      update(s => ({
        messages: { ...s.messages, [roomId]: mergeMessages(s.messages[roomId], page.items) },
        history: { ...s.history, [roomId]: page.next_cursor },
      }));
    },
    connect: () => {
      if (stopRealtime) return;
      if (!listsRequested) { listsRequested = true; void refreshLists(); }
      stopRealtime = openRealtime({
        onEvent: handle,
        // 끊겼다 다시 붙으면 그 사이 놓친 방·메시지를 HTTP 로 다시 읽는다
        onReady: () => { if (everReady) void resync(); everReady = true; },
      });
    },
    disconnect: () => { stopRealtime?.(); stopRealtime = null; },
  };
}
