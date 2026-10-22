import type { CalendarReservation } from "../reservations.types";
import { addDays, dateOf, dayKey, isWeekend, overlaps, seoulDay, seoulTime } from "../reservation-time";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function summary(item: CalendarReservation, day: string) {
  const time = seoulDay(item.start_at) < day ? "이전날부터" : seoulTime(item.start_at);
  return <li key={item.reservation_id} className={`calendar-month-event ${item.is_mine ? "mine" : "other"}`} title={`${item.title} · ${item.room_name} · 참석 ${item.participant_count}명${item.is_attending ? " · 참석 중" : ""}`}>
    <time>{time}</time><span>{item.title}</span>{item.is_attending && <span className="calendar-sr-only">참석 중</span>}
  </li>;
}

export default function MonthCalendar({ month, reservations, onDaySelect }: { month: string; reservations: CalendarReservation[]; onDaySelect: (day: string) => void }) {
  const nextMonth = dateOf(month);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const count = (Date.parse(dayKey(nextMonth)) - Date.parse(month)) / 86400000;
  const offset = (dateOf(month).getUTCDay() + 6) % 7;
  const cellCount = Math.ceil((offset + count) / 7) * 7;
  const today = seoulDay();

  return <div className="calendar-month-scroll"><div className="calendar-month-grid" aria-label="월간 예약 요약">
    {WEEKDAYS.map((day, index) => <div className={`calendar-month-heading${index > 4 ? " weekend" : ""}`} key={day}>{day}</div>)}
    {Array.from({ length: cellCount }, (_, index) => {
      if (index < offset || index >= offset + count) return <div className="calendar-month-blank" aria-hidden="true" key={index} />;
      const day = addDays(month, index - offset);
      const weekend = isWeekend(day);
      const items = reservations.filter(item => overlaps(item, day)).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
      const extra = items.length - 3;
      return <section key={day} className={`calendar-month-day${weekend ? " weekend" : ""}${day === today ? " today" : ""}`} aria-label={`${day} 예약 ${items.length}건`}>
        <button type="button" disabled={weekend} className="calendar-month-date" aria-label={`${day} 주간 보기`} onClick={() => onDaySelect(day)}>{Number(day.slice(8))}</button>
        <ul className="calendar-month-events">{items.slice(0, 3).map(item => summary(item, day))}</ul>
        {extra > 0 && (weekend
          ? <details className="calendar-weekend-more"><summary>+{extra}건</summary><ul className="calendar-month-events">{items.slice(3).map(item => summary(item, day))}</ul></details>
          : <button type="button" className="calendar-month-more" aria-label={`${day} 나머지 ${extra}건 주간 보기`} onClick={() => onDaySelect(day)}>+{extra}건</button>)}
      </section>;
    })}
  </div></div>;
}
