import calendarIcon from "../../../assets/chat-calendar.svg";
import type { ReservationPreview } from "../chat.types";
import { formatChatTime } from "./MessageBubble";

export default function ReservationMessageCard({ reservation }: { reservation: ReservationPreview }) {
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(reservation.startsAt));
  return <article className="chat-reservation-card" aria-label="공유된 회의실 예약">
    <span><img src={calendarIcon} width="14" height="14" alt="" />회의실 예약</span>
    <strong>{reservation.title}</strong>
    <p>{date} {formatChatTime(reservation.startsAt)}–{formatChatTime(reservation.endsAt)} · {reservation.room}</p>
  </article>;
}
