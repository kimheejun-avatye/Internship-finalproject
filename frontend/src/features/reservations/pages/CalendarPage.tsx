import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { getCalendarReservations, getCalendarRooms } from "../reservations.api";
import type { CalendarReservation, CalendarRoom } from "../reservations.types";
import { addDays, boundary, dateOf, dayKey, isValidDay, mondayOf, overlaps, seoulDay } from "../reservation-time";
import CalendarToolbar from "../components/CalendarToolbar";
import WeekCalendar from "../components/WeekCalendar";
import MonthCalendar from "../components/MonthCalendar";
import "../calendar.css";

type QueryResult = { key: string; items: CalendarReservation[]; loading: boolean; error: string };

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requestedDay = params.get("date") || "";
  const anchor = isValidDay(requestedDay) ? requestedDay : seoulDay();
  const view = params.get("view") === "month" ? "month" : "week";
  const scope = params.get("scope") === "mine" ? "mine" : "all";
  const roomId = params.get("room_id") || "";
  const [rooms, setRooms] = useState<CalendarRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomError, setRoomError] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<QueryResult>({ key: "", items: [], loading: true, error: "" });

  const monthStart = `${anchor.slice(0, 7)}-01`;
  const nextMonth = dateOf(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const start = view === "week" ? mondayOf(anchor) : monthStart;
  const end = view === "week" ? addDays(start, 7) : dayKey(nextMonth);
  const queryKey = `${start}/${end}/${roomId}/${retry}`;
  const loading = result.key !== queryKey || result.loading;
  const error = result.key === queryKey ? result.error : "";
  const reservations = result.key === queryKey ? result.items.filter(item => scope === "all" || item.is_mine) : [];
  const saturday = addDays(start, 5);
  const sunday = addDays(start, 6);
  const weekendItems = view === "week" ? reservations.filter(item => overlaps(item, saturday) || overlaps(item, sunday)) : [];

  useEffect(() => {
    const normalized = new URLSearchParams(params);
    normalized.set("date", anchor);
    normalized.set("view", view);
    normalized.set("scope", scope);
    if (normalized.toString() !== params.toString()) setParams(normalized, { replace: true, state: location.state });
  }, [anchor, view, scope, params, setParams, location.state]);

  useEffect(() => {
    let active = true;
    setRoomsLoading(true);
    setRoomError("");
    getCalendarRooms()
      .then(data => { if (active) setRooms(data); })
      .catch((err: unknown) => { if (active) setRoomError(err instanceof Error ? err.message : "회의실 목록을 불러오지 못했습니다."); })
      .finally(() => { if (active) setRoomsLoading(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    let active = true;
    setResult({ key: queryKey, items: [], loading: true, error: "" });
    // 현재 서버의 mine은 '참석'을 뜻하므로, 생성자 필터는 is_mine으로 적용한다.
    getCalendarReservations({ start_at: boundary(start), end_at: boundary(end), scope: "all", room_id: roomId || undefined })
      .then(items => { if (active) setResult({ key: queryKey, items, loading: false, error: "" }); })
      .catch((err: unknown) => {
        if (active) setResult({ key: queryKey, items: [], loading: false, error: err instanceof Error ? err.message : "예약 목록을 불러오지 못했습니다." });
      });
    return () => { active = false; };
  }, [start, end, roomId, queryKey]);

  function update(changes: Record<string, string>) {
    setParams(current => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  function move(direction: number) {
    if (view === "week") update({ date: addDays(anchor, direction * 7) });
    else {
      const date = dateOf(monthStart);
      date.setUTCMonth(date.getUTCMonth() + direction);
      update({ date: dayKey(date) });
    }
  }

  return <section className="calendar-page reservation-calendar" aria-label="예약 캘린더">
    <CalendarToolbar
      anchor={anchor} view={view} scope={scope} roomId={roomId} rooms={rooms}
      roomsDisabled={roomsLoading || Boolean(roomError)}
      onMove={move} onToday={() => update({ date: seoulDay() })}
      onViewChange={value => update({ view: value })}
      onScopeChange={value => update({ scope: value })}
      onRoomChange={value => update({ room_id: value })}
    />
    {location.state?.reservationCreated && <p className="calendar-feedback saved" role="status">예약이 저장되었습니다.</p>}
    {roomError && <p className="calendar-feedback error" role="alert">{roomError} <button type="button" onClick={() => setRetry(n => n + 1)}>회의실 다시 조회</button></p>}
    {loading && <p className="calendar-feedback" role="status">예약을 불러오는 중입니다.</p>}
    {error && <p className="calendar-feedback error" role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>다시 조회</button></p>}
    {!loading && !error && <>
      {reservations.length === 0 && <p className="calendar-feedback" role="status">조회 기간에 예약이 없습니다.</p>}
      {weekendItems.length > 0 && <p className="calendar-weekend-notice">
        주말 일정 {weekendItems.length}건 · <button type="button" onClick={() => update({ view: "month", date: weekendItems.some(item => overlaps(item, saturday)) ? saturday : sunday })}>월간에서 보기</button>
      </p>}
      {view === "week"
        ? <WeekCalendar start={start} reservations={reservations} />
        : <MonthCalendar month={monthStart} reservations={reservations} onDaySelect={date => update({ date, view: "week" })} />}
      <div className="calendar-legend"><span className="mine">내 예약</span><span className="other">다른 구성원의 예약</span><span className="calendar-timezone">한국 시간 기준</span></div>
    </>}
  </section>;
}
