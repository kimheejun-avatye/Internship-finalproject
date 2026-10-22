import { Link } from "react-router-dom";
import leftIcon from "../../../assets/calendar-chevron-left.svg";
import rightIcon from "../../../assets/calendar-chevron-right.svg";
import downIcon from "../../../assets/calendar-chevron-down.svg";
import type { CalendarRoom } from "../reservations.types";
import { addDays, isWeekend, mondayOf, seoulDay } from "../reservation-time";

type Props = {
  anchor: string;
  view: "week" | "month";
  scope: "all" | "mine";
  roomId: string;
  rooms: CalendarRoom[];
  roomsDisabled: boolean;
  onMove: (direction: number) => void;
  onToday: () => void;
  onViewChange: (view: "week" | "month") => void;
  onScopeChange: (scope: "all" | "mine") => void;
  onRoomChange: (roomId: string) => void;
};

function fullDate(day: string) {
  return `${day.slice(0, 4)}년 ${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`;
}

export default function CalendarToolbar(props: Props) {
  const start = mondayOf(props.anchor);
  const last = addDays(start, 4);
  const period = props.view === "month"
    ? `${props.anchor.slice(0, 4)}년 ${Number(props.anchor.slice(5, 7))}월`
    : `${fullDate(start)} — ${start.slice(0, 7) === last.slice(0, 7) ? `${Number(last.slice(8))}일` : fullDate(last)}`;
  // 과거/주말을 보고 있어도 새 예약 진입은 다음 예약 가능한 평일로 안내한다.
  let bookingDay = props.anchor < seoulDay() ? seoulDay() : props.anchor;
  while (isWeekend(bookingDay)) bookingDay = addDays(bookingDay, 1);
  const bookingParams = new URLSearchParams({ date: bookingDay });
  if (props.roomId) bookingParams.set("room_id", props.roomId);

  return <header className="calendar-toolbar">
    <div className="calendar-title-row">
      <h1>예약 캘린더</h1>
      <Link className="calendar-book-link" to={`/reservations?${bookingParams}`}>+ 회의실 예약</Link>
    </div>
    <div className="calendar-control-row">
      <div className="calendar-period-group">
        <h2>{period}</h2>
        <nav className="calendar-date-nav" aria-label="캘린더 기간 이동">
          <button type="button" aria-label={props.view === "week" ? "이전 주" : "이전 달"} onClick={() => props.onMove(-1)}><img src={leftIcon} alt="" /></button>
          <button type="button" onClick={props.onToday}>오늘</button>
          <button type="button" aria-label={props.view === "week" ? "다음 주" : "다음 달"} onClick={() => props.onMove(1)}><img src={rightIcon} alt="" /></button>
        </nav>
      </div>
      <div className="calendar-filter-group">
        <label className="calendar-select"><span className="calendar-sr-only">회의실</span>
          <select value={props.roomId} disabled={props.roomsDisabled} onChange={event => props.onRoomChange(event.target.value)}>
            <option value="">전체 회의실</option>
            {props.rooms.map(room => <option key={room.room_id} value={room.room_id}>{room.name}{room.status === "BLOCK" ? " (차단)" : ""}</option>)}
          </select><img src={downIcon} alt="" />
        </label>
        <label className="calendar-select"><span className="calendar-sr-only">보기</span>
          <select value={props.view} onChange={event => props.onViewChange(event.target.value as "week" | "month")}><option value="week">주간 보기</option><option value="month">월간 보기</option></select><img src={downIcon} alt="" />
        </label>
      </div>
    </div>
    <div className="calendar-scope-row"><label>예약 범위 <select value={props.scope} onChange={event => props.onScopeChange(event.target.value as "all" | "mine")}><option value="all">전체 예약</option><option value="mine">내가 생성한 예약</option></select></label></div>
  </header>;
}
