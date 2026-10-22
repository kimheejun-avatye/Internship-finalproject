import type { ChatData, ChatMessage, ChatSnapshot, Team } from "../chat.types";
import { createMockMe, createMockUsers } from "./users";
import { automaticTitle, seedRooms } from "./rooms";

export function createMockChat(team: Team): ChatData {
  const users = createMockUsers();
  const me = createMockMe(team);
  let sequence = 0;
  let state: ChatSnapshot = { me, users, ...seedRooms(users, me), drafts: {}, screen: { kind: "friends" }, beforeCreate: { kind: "friends" } };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ChatSnapshot>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const roomById = (id: string) => {
    const room = state.rooms.find(r => r.chat_room_id === id);
    if (!room) throw new Error("채팅방을 찾을 수 없습니다.");
    return room;
  };
  return {
    mode: "mock",
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    navigate: screen => publish({ screen, ...(screen.kind === "create" && state.screen.kind !== "create" ? { beforeCreate: state.screen } : {}) }),
    cancelCreate: () => publish({ screen: state.beforeCreate }),
    openRoom: (roomId, origin) => {
      roomById(roomId);
      publish({ screen: { kind: "conversation", roomId, origin }, rooms: state.rooms.map(r => r.chat_room_id === roomId ? { ...r, presentation: { ...r.presentation, unreadCount: 0 } } : r) });
    },
    createRoom: async (memberIds, rawTitle = "") => {
      const uniqueIds = [...new Set(memberIds)];
      if (!uniqueIds.length) throw new Error("대화할 친구를 선택해 주세요.");
      const members = uniqueIds.map(id => state.users.find(u => u.user_id === id));
      if (members.some(u => !u)) throw new Error("대화할 수 없는 사용자가 포함되어 있습니다.");
      const validMembers = members.filter(u => u !== undefined);
      const title = rawTitle.trim();
      if (uniqueIds.length > 1 && Array.from(title).length > 50) throw new Error("채팅방 이름은 50자까지 입력할 수 있습니다.");
      if (uniqueIds.length === 1) {
        const existing = state.rooms.find(r => r.type === "DIRECT" && r.members[0].user_id === uniqueIds[0]);
        if (existing) return existing.chat_room_id;
      }
      const id = `mock-${team.toLowerCase()}-created-${++sequence}`;
      const now = new Date().toISOString();
      const direct = uniqueIds.length === 1;
      publish({ rooms: [...state.rooms, {
        chat_room_id: id, type: direct ? "DIRECT" : "GROUP", title: direct ? null : title || null,
        display_title: direct ? validMembers[0].name : title || automaticTitle(validMembers),
        members: validMembers.map(({ user_id, name }) => ({ user_id, name })), member_count: validMembers.length + 1,
        last_message: null, last_activity_at: now, created_at: now, presentation: { unreadCount: 0 },
      }], messages: { ...state.messages, [id]: [] } });
      return id;
    },
    setDraft: (roomId, value) => { roomById(roomId); publish({ drafts: { ...state.drafts, [roomId]: value } }); },
    sendMessage: async (roomId, rawText) => {
      roomById(roomId);
      const message = rawText.trim();
      if (!message || Array.from(message).length > 2000) throw new Error("메시지는 앞뒤 공백을 제거한 뒤 1~2,000자로 입력해 주세요.");
      const created: ChatMessage = {
        message_id: `mock-message-${team}-${++sequence}`, chat_room_id: roomId, user_id: me.user_id,
        sender: { user_id: me.user_id, name: me.name }, message, created_at: new Date().toISOString(), client_id: null,
        presentation: { readCount: 0 },
      };
      publish({ messages: { ...state.messages, [roomId]: [...state.messages[roomId], created] }, drafts: { ...state.drafts, [roomId]: "" }, rooms: state.rooms.map(r => r.chat_room_id === roomId ? { ...r, last_message: created, last_activity_at: created.created_at } : r) });
    },
  };
}
