import type { CalendarReservation } from "../reservations.types";

export type ReservationActionProps = {
  onDelete: (item: CalendarReservation) => void;
  onMemo: (item: CalendarReservation) => void;
};

export default function ReservationActions({ item, onDelete, onMemo }: ReservationActionProps & { item: CalendarReservation }) {
  return <div className={`reservation-actions ${item.is_mine ? "mine" : "other"}`} onClick={event => event.stopPropagation()}>
    <button type="button" className="reservation-action-memo" disabled={!item.is_attending} title={item.is_attending ? "내 회의록 열기" : "회의 참석자만 회의록을 작성할 수 있습니다."} onClick={() => onMemo(item)}>회의록</button>
    {item.is_mine && <button type="button" className="reservation-action-delete" title="예약 및 모든 개인 회의록 삭제" onClick={() => onDelete(item)}>삭제</button>}
  </div>;
}
