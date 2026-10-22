import type { SelectableUser } from "../../shared/api/users";

export type Team = SelectableUser["team"];
// HTTP DTOs remain independent from preview-only presentation metadata.
export interface ChatUserDto { user_id: string; name: string }
export interface MessageDto {
  message_id: string; chat_room_id: string; user_id: string; sender: ChatUserDto;
  message: string; created_at: string; client_id: string | null;
}
export interface RoomSummaryDto {
  chat_room_id: string; type: "DIRECT" | "GROUP"; title: string | null;
  display_title: string; member_count: number; last_message: MessageDto | null;
  last_activity_at: string; created_at: string;
}
export interface RoomDetailDto extends RoomSummaryDto { members: ChatUserDto[] }

export interface ChatUser extends SelectableUser { profile?: string; online?: boolean }
export interface ReservationPreview { title: string; startsAt: string; endsAt: string; room: string }
export interface ChatMessage extends MessageDto {
  // pending: 서버 응답 전 화면에 먼저 띄운 메시지 (실제 API 모드)
  presentation?: { readCount?: number; reservation?: ReservationPreview; pending?: boolean };
}
export interface ChatRoom extends RoomDetailDto { presentation?: { unreadCount?: number } }
export type ChatTab = "friends" | "rooms";
export type ChatScreen = { kind: ChatTab } | { kind: "create" } | { kind: "conversation"; roomId: string; origin: ChatTab };
export interface ChatSnapshot {
  // messages 에 방 ID 가 없으면 아직 불러오지 않은 방이다
  me: ChatUser; users: ChatUser[]; rooms: ChatRoom[]; messages: Record<string, ChatMessage[]>;
  drafts: Record<string, string>; screen: ChatScreen; beforeCreate: Exclude<ChatScreen, { kind: "create" }>;
  // 실제 API 모드에서만 쓴다. 방별 이전 메시지 커서(null 이면 더 없음)와 목록·연결 오류
  history?: Record<string, string | null>;
  error?: string;
}
export interface ChatData {
  readonly mode: "mock" | "api";
  getSnapshot: () => ChatSnapshot;
  subscribe: (listener: () => void) => () => void;
  navigate: (screen: ChatScreen) => void;
  cancelCreate: () => void;
  openRoom: (roomId: string, origin: ChatTab) => void;
  createRoom: (memberIds: string[], title?: string) => Promise<string>;
  setDraft: (roomId: string, value: string) => void;
  sendMessage: (roomId: string, text: string) => Promise<void>;
  // 서버에서 이전 메시지를 더 읽는다. 목업은 모든 메시지를 메모리에 갖고 있어 없다
  loadOlder?: (roomId: string) => Promise<void>;
  // 실시간 연결. 채팅 패널이 화면에 있는 동안만 연결한다
  connect?: () => void;
  disconnect?: () => void;
}
