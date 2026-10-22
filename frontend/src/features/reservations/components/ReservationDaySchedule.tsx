import type { CalendarReservation, TimeSlot } from "../reservations.types";
import { addDays, boundary, isValidDay, seoulTime } from "../reservation-time";

type Props = {
  date: string;
  reservations: CalendarReservation[];
  slots: TimeSlot[];
  now: number;
  disabled: boolean;
  selectedStart: string;
  selectedEnd: string;
  onSelect: (start: string, end: string) => void;
};
const reasonLabels: Record<string, string> = {
  RESERVED: "예약됨", BLOCKED: "이용 불가", ROOM_BLOCKED: "회의실 이용 중지",
  MY_MEETING: "내 다른 회의", PAST: "지난 시간",
};

export default function ReservationDaySchedule({ date, reservations, slots, now, disabled, selectedStart, selectedEnd, onSelect }: Props) {
  if (!isValidDay(date)) return null;
  const midnight = Date.parse(boundary(date));
  const byStart = new Map(slots.map(slot => [Date.parse(slot.start_at), slot]));
  return <ol className="reservation-day-hours" aria-label={`${date} 24시간 일정`}>
    {Array.from({ length: 24 }, (_, hour) => {
      const from = midnight + hour * 3_600_000, to = from + 3_600_000;
      const start = `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`;
      const end = hour === 23 ? boundary(addDays(date, 1)) : `${date}T${String(hour + 1).padStart(2, "0")}:00:00+09:00`;
      const label = `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`;
      const meetings = reservations.filter(item => Date.parse(item.start_at) < to && Date.parse(item.end_at) > from);
      const slot = byStart.get(from);
      const past = from < now;
      const available = !disabled && !past && Boolean(slot?.available) && meetings.length === 0;
      const selected = available && from >= Date.parse(selectedStart) && to <= Date.parse(selectedEnd);
      const status = past ? "지난 시간" : slot?.reason ? reasonLabels[slot.reason] ?? "선택 불가" : disabled ? "시간 확인 필요" : "선택 불가";
      return <li key={hour}>
        {meetings.length > 0 ? <div className="reservation-hour-row reserved">
          <time>{label}</time>
          <div>{meetings.map(item => <div className="reservation-hour-meeting" key={item.reservation_id}>
            <strong>{item.title}</strong>
            <span>참석 {item.participant_count}명 · {seoulTime(item.start_at)}–{seoulTime(item.end_at)}{Date.parse(item.start_at) < from ? " · 이어지는 일정" : ""}</span>
          </div>)}</div>
          <span className="reservation-hour-status">예약됨</span>
        </div> : <button type="button" className={`reservation-hour-row free${selected ? " selected" : ""}`}
          disabled={!available} aria-label={`${label} ${available ? "빈 시간 선택" : status}`} aria-pressed={selected}
          onClick={() => onSelect(start, end)}>
          <time>{label}</time><span>{available ? selected ? "선택한 시간" : "빈 시간" : status}</span>
          {available && <span className="reservation-hour-status">{selected ? "선택됨" : "선택"}</span>}
        </button>}
      </li>;
    })}
  </ol>;
}
