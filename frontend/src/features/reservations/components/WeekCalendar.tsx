import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CalendarReservation } from "../reservations.types";
import { addDays, boundary, overlaps, seoulDay, seoulTime } from "../reservation-time";

import ReservationActions, { type ReservationActionProps } from "./ReservationActions";

const BASE_HOUR_HEIGHT = 108;
const WEEKDAYS = ["월", "화", "수", "목", "금"];
type Segment = { item: CalendarReservation; from: number; to: number; lane: number; lanes: number };

function layoutDay(reservations: CalendarReservation[], day: string): Segment[] {
  const midnight = Date.parse(boundary(day));
  const segments = reservations.filter(item => overlaps(item, day)).map(item => ({
    item,
    from: Math.max(0, (Date.parse(item.start_at) - midnight) / 60000),
    to: Math.min(1440, (Date.parse(item.end_at) - midnight) / 60000),
    lane: 0, lanes: 1,
  })).sort((a, b) => a.from - b.from || b.to - a.to || a.item.reservation_id.localeCompare(b.item.reservation_id));
  let group: Segment[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  function finishGroup() {
    for (const segment of group) segment.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  }
  for (const segment of segments) {
    if (segment.from >= groupEnd) finishGroup();
    let lane = laneEnds.findIndex(end => end <= segment.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.to;
    segment.lane = lane;
    group.push(segment);
    groupEnd = Math.max(groupEnd, segment.to);
  }
  finishGroup();
  return segments;
}

function intervalLabel(item: CalendarReservation) {
  const startDay = seoulDay(item.start_at);
  const endDay = seoulDay(item.end_at);
  return startDay === endDay
    ? `${seoulTime(item.start_at)}–${seoulTime(item.end_at)}`
    : `${startDay.slice(5)} ${seoulTime(item.start_at)}–${endDay.slice(5)} ${seoulTime(item.end_at)}`;
}

export default function WeekCalendar({ start, reservations, onDelete, onMemo }: { start: string; reservations: CalendarReservation[] } & ReservationActionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hourHeight, setHourHeight] = useState(BASE_HOUR_HEIGHT);
  const minuteHeight = hourHeight / 60;
  const previousHeight = useRef(hourHeight);
  const today = seoulDay();
  const days = Array.from({ length: 5 }, (_, index) => addDays(start, index));
  const layouts = days.map(day => layoutDay(reservations, day));
  // 동시간 예약이 많아도 카드가 서로 가리지 않도록 필요한 열 폭을 확보한다.
  const columnWidths = layouts.map(segments => `${Math.max(220, ...segments.map(segment => segment.lanes * 220))}px`);
  const gridColumns = `54px ${columnWidths.map(width => `minmax(${width}, 1fr)`).join(" ")}`;

  useLayoutEffect(() => {
    const nodes = [...scrollRef.current!.querySelectorAll<HTMLElement>(".calendar-event-content")];
    const measure = () => {
      // 긴 제목이나 자정 경계의 짧은 구간도 카드만 늘리지 않고 시간 축 전체를 늘린다.
      const needed = nodes.map(node => {
        const actions = node.parentElement?.querySelector<HTMLElement>(".reservation-actions");
        return Math.ceil((node.scrollHeight + (actions?.scrollHeight ?? 0) + 19) * 60 / Number(node.dataset.minutes));
      });
      setHourHeight(Math.max(BASE_HOUR_HEIGHT, ...needed));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    nodes.forEach(node => {
      observer.observe(node);
      const actions = node.parentElement?.querySelector(".reservation-actions");
      if (actions) observer.observe(actions);
    });
    return () => observer.disconnect();
  }, [reservations, start, gridColumns]);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop *= hourHeight / previousHeight.current;
    previousHeight.current = hourHeight;
  }, [hourHeight]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 9 * previousHeight.current;
  }, [start]);

  return <div className="calendar-week-scroll" ref={scrollRef} tabIndex={0} aria-label="주간 시간표, 한국 시간 00시부터 24시까지">
    <div className="calendar-week-grid" style={{ gridTemplateColumns: gridColumns, "--calendar-hour-height": `${hourHeight}px` } as CSSProperties}>
      <div className="calendar-week-corner" aria-hidden="true" />
      {days.map((day, index) => <div className={`calendar-week-heading${day === today ? " today" : ""}`} key={day}>
        <span>{WEEKDAYS[index]}</span><strong aria-label={day}>{Number(day.slice(8))}</strong>
      </div>)}
      <div className="calendar-time-gutter" aria-hidden="true" style={{ height: 24 * hourHeight }}>
        {Array.from({ length: 25 }, (_, hour) => <span key={hour} style={{ top: hour * hourHeight }}>{String(hour).padStart(2, "0")}:00</span>)}
      </div>
      {days.map((day, index) => <section className="calendar-week-day" key={day} aria-label={`${day} ${WEEKDAYS[index]}요일 일정`} style={{ height: 24 * hourHeight }}>
        {layouts[index].map(({ item, from, to, lane, lanes }) => {
          const label = `${item.title}, ${intervalLabel(item)}, ${item.room_name}, 참석 ${item.participant_count}명, ${item.is_mine ? "내 예약" : "다른 구성원의 예약"}${item.is_attending ? ", 참석 중" : ""}`;
          return <article key={item.reservation_id} tabIndex={0} aria-label={label} title={label}
            className={`calendar-week-event ${item.is_mine ? "mine" : "other"}`}
            style={{ top: from * minuteHeight + 2, height: Math.max(2, (to - from) * minuteHeight - 4), left: `calc(${lane / lanes * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)` }}>
            <div className="calendar-event-content" data-minutes={to - from}>
              <strong>{item.title}</strong>
              <span>{intervalLabel(item)}</span>
              <span className="calendar-event-meta">{item.room_name} · 참석 {item.participant_count}명{item.is_attending ? " · 참석 중" : ""}</span>
              {seoulDay(item.start_at) < day && <span>이전 날짜부터 이어짐</span>}
              {Date.parse(item.end_at) > Date.parse(boundary(addDays(day, 1))) && <span>다음 날짜에 계속</span>}
            </div>
            <ReservationActions item={item} onDelete={onDelete} onMemo={onMemo} />
          </article>;
        })}
      </section>)}
    </div>
  </div>;
}
