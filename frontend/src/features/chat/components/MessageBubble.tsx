import type { ChatMessage, ReservationPreview } from "../chat.types";
import ReservationMessageCard from "./ReservationMessageCard";

export function formatChatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
export function formatChatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(value));
}
// 카드로 그릴 예약. 미리보기용 데이터가 우선이고, 없으면 서버가 보낸 예약 카드(payload)를 쓴다.
// 데이터가 없는 RESERVATION 메시지는 카드 대신 같이 저장된 글을 보여 준다.
export function reservationOf(message: ChatMessage): ReservationPreview | undefined {
  if (message.presentation?.reservation) return message.presentation.reservation;
  const card = message.kind === "RESERVATION" ? message.payload : undefined;
  return card ? { title: card.title, startsAt: card.start_at, endsAt: card.end_at, room: card.room_name } : undefined;
}
export default function MessageBubble({ message, own, group }: { message: ChatMessage; own: boolean; group: boolean }) {
  const reads = message.presentation?.readCount;
  const reservation = reservationOf(message);
  return <div className={"chat-message" + (own ? " chat-message--own" : "")} data-message-id={message.message_id}>
    <div className={"chat-message-content" + (reservation ? " chat-message-content--reservation" : "")}>
      {!own && <p className="chat-message-sender">{message.sender.name}</p>}
      {reservation ? <ReservationMessageCard reservation={reservation} /> : <p className="chat-message-bubble">{message.message}</p>}
    </div>
    <div className="chat-message-meta">{message.presentation?.pending ? <span>전송 중</span> : <>{own && reads !== undefined && <span>{group ? reads + "명 확인" : reads ? "읽음" : "안 읽음"}</span>}<time dateTime={message.created_at}>{formatChatTime(message.created_at)}</time></>}</div>
  </div>;
}
