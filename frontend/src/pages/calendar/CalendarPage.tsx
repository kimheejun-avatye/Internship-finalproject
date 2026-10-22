import { useEffect, useRef, useState } from "react";
import {
  getCalendarReservations, getCalendarRooms,
  type CalendarReservation, type CalendarRoom,
} from "../../shared/api/calendar";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const SEOUL_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});
const SEOUL_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// 브라우저 시간대와 무관하게 날짜를 계산하고 API 조회 경계에 한국 시간을 명시한다.
function dayKey(date: Date) { return date.toISOString().slice(0, 10); }
function dateOf(day: string) { return new Date(`${day}T00:00:00Z`); }
function addDays(day: string, amount: number) {
  const date = dateOf(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return dayKey(date);
}
function today() {
  const parts = SEOUL_DAY.formatToParts(new Date());
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function mondayOf(day: string) { return addDays(day, -((dateOf(day).getUTCDay() + 6) % 7)); }
function boundary(day: string) { return `${day}T00:00:00+09:00`; }
function overlaps(item: CalendarReservation, day: string) {
  return Date.parse(item.start_at) < Date.parse(boundary(addDays(day, 1)))
    && Date.parse(item.end_at) > Date.parse(boundary(day));
}

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<"week" | "month">("week");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<CalendarRoom[]>([]);
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [error, setError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const monthStart = `${anchor.slice(0, 7)}-01`;
  const nextMonth = dateOf(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const start = view === "week" ? mondayOf(anchor) : monthStart;
  const end = view === "week" ? addDays(start, 7) : dayKey(nextMonth);
  const count = view === "week" ? 7 : Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));

  useEffect(() => {
    let active = true;
    setRoomsLoading(true);
    setRoomError("");
    getCalendarRooms().then(data => { if (active) setRooms(data); })
      .catch((err: unknown) => { if (active) setRoomError(err instanceof Error ? err.message : "회의실 목록을 불러오지 못했습니다."); })
      .finally(() => { if (active) setRoomsLoading(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setReservations([]);
    setSelectedDay(null);
    getCalendarReservations({ start_at: boundary(start), end_at: boundary(end), scope, room_id: roomId || undefined })
      .then(data => { if (active) setReservations(data); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "예약 목록을 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    // 이전 요청의 응답이 새 필터의 결과를 덮어쓰지 않도록 한다.
    return () => { active = false; };
  }, [start, end, scope, roomId, retry]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedDay && dialog && !dialog.open) dialog.showModal();
    else if (!selectedDay && dialog?.open) dialog.close();
  }, [selectedDay]);

  function move(direction: number) {
    if (view === "week") setAnchor(addDays(anchor, direction * 7));
    else {
      const date = dateOf(monthStart);
      date.setUTCMonth(date.getUTCMonth() + direction);
      setAnchor(dayKey(date));
    }
  }

  function event(item: CalendarReservation) {
    return <div key={item.reservation_id} className={`calendar-item ${item.is_mine ? "mine" : "other"}`}>
      <strong>{item.title}</strong>
      <span>{SEOUL_TIME.format(new Date(item.start_at))}–{SEOUL_TIME.format(new Date(item.end_at))}</span>
      <span>{item.room_name} · 참석 {item.participant_count}명</span>
      <span>{item.is_mine ? "내 예약" : "다른 구성원의 예약"}{item.is_attending ? " · 참석 중" : ""}</span>
    </div>;
  }

  return <>
    <h1 className="page-title">예약 캘린더</h1>
    <div className="card cal-toolbar calendar-controls">
      <h2>{view === "month" ? anchor.slice(0, 7) : `${start} — ${addDays(end, -1)}`}</h2>
      <div className="cal-nav">
        <button type="button" aria-label={view === "week" ? "이전 주" : "이전 달"} onClick={() => move(-1)}>‹</button>
        <button type="button" onClick={() => setAnchor(today())}>오늘</button>
        <button type="button" aria-label={view === "week" ? "다음 주" : "다음 달"} onClick={() => move(1)}>›</button>
      </div>
      <label>보기 <select value={view} onChange={e => setView(e.target.value as "week" | "month")}><option value="week">주간</option><option value="month">월간</option></select></label>
      <label>예약 범위 <select value={scope} onChange={e => setScope(e.target.value as "all" | "mine")}><option value="all">전체 예약</option><option value="mine">내가 생성한 예약</option></select></label>
      <label>회의실 <select value={roomId} disabled={roomsLoading || Boolean(roomError)} onChange={e => setRoomId(e.target.value)}><option value="">전체 회의실</option>{rooms.map(room => <option key={room.room_id} value={room.room_id}>{room.name}{room.status === "BLOCK" ? " (차단)" : ""}</option>)}</select></label>
      <span>한국 시간 기준</span>
    </div>
    {roomError && <p role="alert">{roomError} <button onClick={() => setRetry(n => n + 1)}>회의실 다시 조회</button></p>}
    {loading && <p role="status">예약을 불러오는 중입니다.</p>}
    {error && <p role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>다시 조회</button></p>}
    {!loading && !error && <>
      {reservations.length === 0 && <p role="status">조회 기간에 예약이 없습니다.</p>}
      <div className="calendar-scroll"><div className={`card calendar-grid ${view}`}>
        {DOW.map(day => <div className="calendar-weekday" key={day}>{day}</div>)}
        {view === "month" && Array.from({ length: (dateOf(start).getUTCDay() + 6) % 7 }, (_, i) => <div className="calendar-blank" key={`blank-${i}`} />)}
        {days.map(day => {
          const items = reservations.filter(item => overlaps(item, day));
          return <section key={day} className={`calendar-day${day === today() ? " today" : ""}`}>
            <button className="calendar-day-button" type="button" aria-label={`${day} 예약 보기`} onClick={() => setSelectedDay(day)}>{Number(day.slice(-2))}일 · {items.length}건</button>
            {items.map(event)}
          </section>;
        })}
      </div></div>
      <div className="legend"><span className="mine">내 예약</span><span className="other">다른 구성원의 예약</span></div>
    </>}
    <dialog ref={dialogRef} className="calendar-dialog" aria-labelledby="calendar-dialog-title" onCancel={() => setSelectedDay(null)} onClose={() => setSelectedDay(null)}>
      <h2 id="calendar-dialog-title">{selectedDay} 예약 목록</h2>
      {selectedDay && reservations.filter(item => overlaps(item, selectedDay)).map(event)}
      {selectedDay && !reservations.some(item => overlaps(item, selectedDay)) && <p>예약이 없습니다.</p>}
      <button type="button" onClick={() => setSelectedDay(null)}>닫기</button>
    </dialog>
  </>;
}
