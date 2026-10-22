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
  presentation?: { readCount?: number; reservation?: ReservationPreview };
}
export interface ChatRoom extends RoomDetailDto { presentation?: { unreadCount?: number } }
export type ChatTab = "friends" | "rooms";
export type ChatScreen = { kind: ChatTab } | { kind: "create" } | { kind: "conversation"; roomId: string; origin: ChatTab };
export interface ChatSnapshot {
  me: ChatUser; users: ChatUser[]; rooms: ChatRoom[]; messages: Record<string, ChatMessage[]>;
  drafts: Record<string, string>; screen: ChatScreen; beforeCreate: Exclude<ChatScreen, { kind: "create" }>;
}
export interface ChatData {
  readonly mode: "mock";
  getSnapshot: () => ChatSnapshot;
  subscribe: (listener: () => void) => () => void;
  navigate: (screen: ChatScreen) => void;
  cancelCreate: () => void;
  openRoom: (roomId: string, origin: ChatTab) => void;
  createRoom: (memberIds: string[], title?: string) => string;
  setDraft: (roomId: string, value: string) => void;
  sendMessage: (roomId: string, text: string) => void;
}
