import type { ChatMessage } from "../chat.types";
import ReservationMessageCard from "./ReservationMessageCard";

export function formatChatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
export function formatChatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(value));
}
export default function MessageBubble({ message, own, group }: { message: ChatMessage; own: boolean; group: boolean }) {
  const reads = message.presentation?.readCount;
  return <div className={"chat-message" + (own ? " chat-message--own" : "")} data-message-id={message.message_id}>
    <div className={"chat-message-content" + (message.presentation?.reservation ? " chat-message-content--reservation" : "")}>
      {!own && <p className="chat-message-sender">{message.sender.name}</p>}
      {message.presentation?.reservation ? <ReservationMessageCard reservation={message.presentation.reservation} /> : <p className="chat-message-bubble">{message.message}</p>}
    </div>
    <div className="chat-message-meta">{message.presentation?.pending ? <span>전송 중</span> : <>{own && reads !== undefined && <span>{group ? reads + "명 확인" : reads ? "읽음" : "안 읽음"}</span>}<time dateTime={message.created_at}>{formatChatTime(message.created_at)}</time></>}</div>
  </div>;
}
