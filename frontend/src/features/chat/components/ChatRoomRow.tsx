import type { ChatRoom } from "../chat.types";
import { formatChatTime } from "./MessageBubble";

export default function ChatRoomRow({ room, onOpen }: { room: ChatRoom; onOpen: () => void }) {
  const unread = room.presentation?.unreadCount ?? 0;
  const preview = room.last_message ? (room.type === "GROUP" ? room.last_message.sender.name + ": " : "") + room.last_message.message : "첫 메시지를 보내보세요.";
  return <li><button type="button" className="chat-room-row" aria-label={room.display_title + " 대화 열기"} onClick={onOpen}>
    <span className="chat-room-title"><strong>{room.display_title}</strong>{room.type === "GROUP" && <span>{room.member_count}</span>}<time dateTime={room.last_activity_at}>{formatChatTime(room.last_activity_at)}</time></span>
    <span className={"chat-room-preview" + (unread ? " chat-room-preview--unread" : "")}><span>{preview}</span>{unread > 0 && <b className="chat-unread-badge" aria-label={"안 읽은 메시지 " + unread + "개"}>{unread > 99 ? "99+" : unread}</b>}</span>
  </button></li>;
}
