import type { ChatMessage, ChatRoom, ChatUser } from "../chat.types";
import { seedMessages } from "./messages";

export function automaticTitle(members: ChatUser[]): string {
  const names = members.slice(0, 2).map(u => u.name).join(", ");
  return members.length > 2 ? `${names} 외 ${members.length - 2}명` : names;
}
export function seedRooms(users: ChatUser[], me: ChatUser) {
  const teamUsers = users.filter(u => u.team === me.team).sort((a, b) => a.user_id.localeCompare(b.user_id));
  const groups = [[teamUsers[0]], [teamUsers[4]], [teamUsers[0], teamUsers[1], teamUsers[4]], [teamUsers[7], teamUsers[8], teamUsers[9]]];
  const messages: Record<string, ChatMessage[]> = {};
  const rooms: ChatRoom[] = groups.map((members, index) => {
    const room: ChatRoom = {
      chat_room_id: `mock-${me.team.toLowerCase()}-room-${index + 1}`, type: index < 2 ? "DIRECT" : "GROUP",
      title: index < 2 ? null : index === 2 ? "프로덕트 주간 회의" : "서비스 개선 프로젝트",
      display_title: index < 2 ? members[0].name : index === 2 ? "프로덕트 주간 회의" : "서비스 개선 프로젝트",
      members: members.map(({ user_id, name }) => ({ user_id, name })), member_count: members.length + 1,
      created_at: "2026-10-15T00:00:00Z", last_activity_at: "2026-10-15T00:00:00Z", last_message: null,
      presentation: { unreadCount: [0, 1, 3, 0][index] },
    };
    messages[room.chat_room_id] = seedMessages(room, me, index * 10);
    room.last_message = messages[room.chat_room_id].at(-1)!;
    room.last_activity_at = room.last_message.created_at;
    return room;
  });
  // An additional empty room demonstrates the first-message state.
  const emptyId = `mock-${me.team.toLowerCase()}-empty`;
  rooms.push({ chat_room_id: emptyId, type: "GROUP", title: "새 프로젝트 준비", display_title: "새 프로젝트 준비", members: teamUsers.slice(10, 12).map(({ user_id, name }) => ({ user_id, name })), member_count: 3, created_at: "2026-10-14T00:00:00Z", last_activity_at: "2026-10-14T00:00:00Z", last_message: null, presentation: { unreadCount: 0 } });
  messages[emptyId] = [];
  return { rooms, messages };
}
