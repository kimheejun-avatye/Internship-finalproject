import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../reservations.api";
import type { ReservationList, Room, TimeSlot } from "../reservations.types";
import { MAX_BOOKING_DAYS, MAX_RESERVATION_HOURS, MAX_TITLE_LENGTH, addDays, dateOf, isValidDay, isWeekend, seoulDay, seoulTime } from "../reservation-time";
import { ApiError } from "../../../shared/api/client";
import TimeSlotPicker, { HOUR_OPTIONS, isAvailableRange, slotTime } from "../components/TimeSlotPicker";
import AttendeePicker from "../components/AttendeePicker";
import "../reservation.css";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.extra.fields) return Object.values(error.extra.fields).join(" ");
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
function defaultDate() {
  let day = seoulDay();
  while (isWeekend(day)) day = addDays(day, 1);
  return day;
}
// 예약 저장 뒤 참석자 공유 결과를 한 문장으로 알려 준다. 예약 자체는 이미 저장된 상태다.
function savedMessage(share: { sent: number; failed: number } | "error" | null) {
  if (share === null) return "예약이 저장되었습니다.";
  if (share === "error") return "예약이 저장되었습니다. 참석자에게 채팅으로 공유하지 못했습니다.";
  if (share.failed === 0) return `예약이 저장되었습니다. 참석자 ${share.sent}명에게 채팅으로 공유했습니다.`;
  return `예약이 저장되었습니다. ${share.sent}명에게 공유했고 ${share.failed}명에게는 보내지 못했습니다.`;
}
function timeRange(start: string, end: string, today: string) {
  const startDay = seoulDay(start), endDay = seoulDay(end);
  if (startDay === today && endDay === today) return `${seoulTime(start)}–${seoulTime(end)}`;
  return `${startDay} ${seoulTime(start)} – ${endDay} ${seoulTime(end)}`;
}
const NO_BUSY: ReadonlySet<string> = new Set();
type Listing = { roomId: string; page: number; data: ReservationList | null; error: string };
type Selection = { key: string; startHour: string; endHour: string; endDate: string; otherDate: boolean };
type Availability = { key: string; status: "loading" | "ready" | "error"; slots: TimeSlot[]; error: string; loaded: number; total: number };

export default function ReservationPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mounted = useRef(false), submitting = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const [roomRetry, setRoomRetry] = useState(0);
  const [listing, setListing] = useState<Listing | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [shareToChat, setShareToChat] = useState(false);
  const [busyUsers, setBusyUsers] = useState<{ key: string; ids: ReadonlySet<string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const today = seoulDay(new Date(now));
  const date = params.get("date") ?? defaultDate();
  const room = rooms.find(item => item.room_id === params.get("room_id"))
    ?? rooms.find(item => item.status === "ACTIVE");
  const roomId = room?.room_id ?? "";
  const roomBlocked = room?.status === "BLOCK";
  const requestedPage = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const current = listing?.roomId === roomId && listing.page === page ? listing : null;
  const loading = Boolean(roomId) && (!current || (!current.data && !current.error));
  const data = current?.data;
  const selectionKey = `${roomId}|${date}`;
  const chosen: Selection = selection?.key === selectionKey ? selection : { key: selectionKey, startHour: "", endHour: "", endDate: date, otherDate: false };
  const { startHour, endHour, endDate, otherDate } = chosen;
  const dateError = !isValidDay(date) ? "예약 날짜를 선택해 주세요." : date < today ? "오늘 이후 날짜를 선택해 주세요."
    : date > addDays(today, MAX_BOOKING_DAYS) ? `예약은 오늘부터 ${MAX_BOOKING_DAYS}일 이내 날짜만 가능합니다.`
    : isWeekend(date) ? "예약 시작 날짜는 평일을 선택해 주세요." : "";
  const endDateError = !isValidDay(endDate) || endDate < date ? "종료 날짜는 시작 날짜 이후로 선택해 주세요."
    : endDate > addDays(date, 1) ? `최대 ${MAX_RESERVATION_HOURS}시간까지 예약할 수 있어 종료 날짜는 시작 날짜의 다음 날까지 선택할 수 있습니다.` : "";
  const availabilityKey = `${selectionKey}|${room?.status}|${endDate}|${availabilityRetry}`;
  const currentAvailability = availability?.key === availabilityKey ? availability : null;
  const slots = currentAvailability?.status === "ready" ? currentAvailability.slots : [];
  const availabilityLoading = Boolean(roomId) && !roomBlocked && !dateError && !endDateError && (!currentAvailability || currentAvailability.status === "loading");
  const startAt = slotTime(date, startHour), endAt = slotTime(endDate, endHour);
  const validRange = Boolean(startHour && endHour) && !dateError && !endDateError
    && Date.parse(startAt) >= now && isAvailableRange(slots, startAt, endAt);
  // 선택한 시간에 다른 회의가 있는 사람. 고른 참석자가 여기에 들어 있으면 예약 버튼을 막는다(서버도 최종 검사한다).
  const busyKey = validRange ? `${startAt}|${endAt}` : "";
  const busyIds = busyUsers?.key === busyKey ? busyUsers.ids : NO_BUSY;
  const attendeeBusy = attendees.some(id => busyIds.has(id));
  const calendarParams = new URLSearchParams({ date: isValidDay(date) ? date : today, view: "week" });
  if (roomId) calendarParams.set("room_id", roomId);

  useEffect(() => {
    if (!busyKey) return;
    let active = true;
    // 실패해도 예약은 서버 검사로 막히므로 표시만 생략한다.
    api.getBusyUsers(startAt, endAt)
      .then(result => { if (active) setBusyUsers({ key: busyKey, ids: new Set(result.user_ids) }); })
      .catch(() => {});
    return () => { active = false; };
  }, [busyKey, startAt, endAt]);
  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    setRoomsLoading(true); setRoomsError("");
    api.listRooms().then(values => { if (active) setRooms(values); })
      .catch(failure => { if (active) setRoomsError(errorMessage(failure)); })
      .finally(() => { if (active) setRoomsLoading(false); });
    return () => { active = false; };
  }, [roomRetry]);
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    setListing({ roomId, page, data: null, error: "" });
    api.listReservations(roomId, page).then(
      values => { if (active) setListing({ roomId, page, data: values, error: "" }); },
      failure => { if (active) setListing({ roomId, page, data: null, error: errorMessage(failure) }); },
    );
    return () => { active = false; };
  }, [roomId, page, refresh, today]);
  useEffect(() => {
    if (!roomId || roomBlocked || dateError || endDateError) return;
    let active = true, failed = false, nextDay = 0, loaded = 0;
    const total = Math.round((dateOf(endDate).getTime() - dateOf(date).getTime()) / 86_400_000) + 1;
    const collected: TimeSlot[] = [];
    setAvailability({ key: availabilityKey, status: "loading", slots: [], error: "", loaded: 0, total });
    async function worker() {
      while (active && !failed && nextDay < total) {
        const day = addDays(date, nextDay++);
        const result = await api.getAvailability(roomId, day, 60);
        if (!active || failed) return;
        collected.push(...result); loaded += 1;
        setAvailability({ key: availabilityKey, status: "loading", slots: [], error: "", loaded, total });
      }
    }
    // Duration is unrestricted; only three date requests run concurrently. Changing dates stops the queue.
    void Promise.all(Array.from({ length: Math.min(3, total) }, worker)).then(() => {
      if (active && !failed) setAvailability({ key: availabilityKey, status: "ready", slots: [...new Map(collected.map(slot => [Date.parse(slot.start_at), slot])).values()].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at)), error: "", loaded, total });
    }).catch(failure => {
      failed = true;
      if (active) setAvailability({ key: availabilityKey, status: "error", slots: [], error: errorMessage(failure), loaded, total });
    });
    return () => { active = false; };
  }, [roomId, roomBlocked, date, endDate, dateError, endDateError, availabilityKey]);
  useEffect(() => {
    if (currentAvailability?.status !== "ready" || dateError || endDateError) return;
    if (!startHour) {
      const possible = slots.filter(slot => seoulDay(slot.start_at) === date && slot.available && Date.parse(slot.start_at) >= Date.now());
      const first = possible.find(slot => seoulTime(slot.start_at) === "09:00") ?? possible[0];
      if (first) {
        const suggestedEndDate = otherDate ? endDate : seoulDay(first.end_at);
        const suggestedEndHour = otherDate
          ? endHour || HOUR_OPTIONS.find(hour => isAvailableRange(slots, first.start_at, slotTime(endDate, hour))) || ""
          : seoulTime(first.end_at);
        setSelection({ key: selectionKey, startHour: seoulTime(first.start_at), endHour: suggestedEndHour, endDate: suggestedEndDate, otherDate: otherDate || suggestedEndDate !== date });
      }
    } else if (!endHour) {
      const firstEnd = HOUR_OPTIONS.find(hour => isAvailableRange(slots, startAt, slotTime(endDate, hour)));
      if (firstEnd) setSelection(previous => previous?.key === selectionKey ? { ...previous, endHour: firstEnd } : previous);
    }
  }, [currentAvailability, date, dateError, endDate, endDateError, startHour, endHour, otherDate, startAt, selectionKey, slots]);

  function selectPage(selectedRoom: string, selectedPage: number) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set("room_id", selectedRoom); next.set("page", String(selectedPage)); next.set("date", date);
      return next;
    }, { replace: true });
  }
  function selectDate(value: string) {
    setError("");
    setParams(previous => {
      const next = new URLSearchParams(previous); next.set("date", value);
      if (roomId) next.set("room_id", roomId);
      return next;
    }, { replace: true });
  }
  function changeSelection(next: Partial<Selection>) { setError(""); setSelection({ ...chosen, ...next }); }
  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !roomId || roomBlocked) return;
    setError("");
    if (!title.trim()) return setError("회의 제목을 입력해 주세요.");
    if (title.trim().length > MAX_TITLE_LENGTH) return setError(`회의 제목은 ${MAX_TITLE_LENGTH}자 이하로 입력해 주세요.`);
    if (dateError || endDateError) return setError(dateError || endDateError);
    if (!startHour || !endHour) return setError("시작과 종료 시각을 선택해 주세요.");
    if (Date.parse(startAt) < Date.now()) {
      setAvailabilityRetry(value => value + 1);
      return setError("시작 시각은 과거일 수 없습니다. 가능한 시간을 다시 선택해 주세요.");
    }
    if (attendeeBusy) return;
    if (!validRange || currentAvailability?.status !== "ready") return setError("선택한 구간에 예약할 수 없는 시간이 있습니다. 가능한 연속 시간을 선택해 주세요.");
    submitting.current = true; setBusy(true);
    try {
      const created = await api.createReservation({ room_id: roomId, title: title.trim(), start_at: startAt, end_at: endAt, attendee_ids: [...new Set(attendees)] });
      // 공유 실패는 예약 저장을 되돌리지 않는다. 결과만 알려 준다.
      let share: { sent: number; failed: number } | "error" | null = null;
      if (shareToChat && attendees.length > 0) {
        share = await api.shareReservation(created.reservation_id)
          .then(result => ({ sent: result.sent_user_ids.length, failed: result.failed_user_ids.length }))
          .catch((): "error" => "error");
      }
      if (!mounted.current) return;
      navigate(`/calendar?${new URLSearchParams({ date, view: "week", room_id: roomId })}`, { state: { reservationCreated: true, message: savedMessage(share) } });
    } catch (failure) {
      if (!mounted.current) return;
      setError(errorMessage(failure));
      if (failure instanceof ApiError && ["RESERVATION_CONFLICT", "ROOM_UNAVAILABLE", "ROOM_BLOCKED", "START_IN_PAST", "INVALID_TIME_SLOT"].includes(failure.code)) {
        setAvailabilityRetry(value => value + 1); setRefresh(value => value + 1);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <div className="reservation-page">
    <div className="reservation-page-heading"><h1 className="page-title">회의실 예약</h1><Link to={`/calendar?${calendarParams}`}>캘린더로 돌아가기</Link></div>
    <form className="reservation-booking" onSubmit={book} noValidate>
      <div className="reservation-form-card">
        <label className="reservation-field reservation-title-field">회의 제목
          <input required maxLength={MAX_TITLE_LENGTH} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="회의 제목을 입력하세요" />
        </label>
        <div className="reservation-input-row">
          <label className="reservation-field">예약 날짜
            <input type="date" required min={today} max={addDays(today, MAX_BOOKING_DAYS)} value={isValidDay(date) ? date : ""} disabled={busy} onChange={event => selectDate(event.target.value)} />
          </label>
          <TimeSlotPicker date={date} endDate={endDate} startHour={startHour} endHour={endHour} slots={slots} now={now}
            loading={availabilityLoading} disabled={busy || !room || roomBlocked || Boolean(dateError || endDateError || currentAvailability?.error)}
            onStartChange={hour => changeSelection(hour === "23:00" && endDate === date
              ? { startHour: hour, endHour: "00:00", endDate: addDays(date, 1), otherDate: true }
              : { startHour: hour, endHour: "" })}
            onEndChange={hour => changeSelection({ endHour: hour })} />
          <AttendeePicker selected={attendees} onChange={setAttendees} capacity={room?.capacity} disabled={busy} busyIds={busyIds} />
          <label className="reservation-share-option">
            <input type="checkbox" checked={shareToChat && attendees.length > 0} disabled={busy || attendees.length === 0}
              onChange={event => setShareToChat(event.target.checked)} />저장 후 참석자에게 채팅으로 일정 공유
          </label>
        </div>
        <div className="reservation-date-options">
          <label className="reservation-cross-day"><input type="checkbox" checked={otherDate} disabled={busy || !isValidDay(date)}
            onChange={event => changeSelection({ otherDate: event.target.checked, endDate: event.target.checked ? addDays(date, 1) : date, endHour: "" })} />다른 날짜에 종료</label>
          {otherDate && <label className="reservation-field reservation-end-date">종료 날짜
            <input type="date" required min={date} max={addDays(date, 1)} value={isValidDay(endDate) ? endDate : ""} disabled={busy}
              onChange={event => changeSelection({ endDate: event.target.value, endHour: "" })} />
          </label>}
          <span className="reservation-field-hint">한국 시간 · 1시간 단위 · 최대 {MAX_RESERVATION_HOURS}시간</span>
        </div>
        {(dateError || endDateError) && <p className="reservation-inline-error" role="alert">{dateError || endDateError}</p>}
        {availabilityLoading && <p className="reservation-field-hint" role="status">가능한 시간을 확인하고 있습니다.{currentAvailability && currentAvailability.total > 1 ? ` (${currentAvailability.loaded}/${currentAvailability.total}일)` : ""}</p>}
        {currentAvailability?.error && <div className="reservation-inline-error" role="alert">{currentAvailability.error} <button type="button" onClick={() => setAvailabilityRetry(value => value + 1)}>가능 시간 다시 조회</button></div>}
        {!dateError && !endDateError && currentAvailability?.status === "ready" && !startHour && <p className="reservation-field-hint">선택한 날짜에 시작할 수 있는 시간이 없습니다. 다른 날짜나 회의실을 선택해 주세요.</p>}
        {!dateError && !endDateError && currentAvailability?.status === "ready" && startHour && !validRange && <p className="reservation-inline-error">예약 가능한 연속 구간의 종료 시간을 선택해 주세요.</p>}
        {validRange && <p className="reservation-selected-range">{date} {startHour} – {endDate !== date ? `${endDate} ` : ""}{endHour}<span> · {(Date.parse(endAt) - Date.parse(startAt)) / 3_600_000}시간</span></p>}
      </div>
      {roomsLoading && <p role="status">회의실을 불러오는 중입니다.</p>}
      {roomsError && <div role="alert"><p>{roomsError}</p><button type="button" className="reservation-retry" onClick={() => setRoomRetry(value => value + 1)}>회의실 다시 조회</button></div>}
      {!roomsLoading && !roomsError && rooms.length === 0 && <p>등록된 회의실이 없습니다.</p>}
      {roomBlocked && <p className="reservation-inline-error" role="status">선택한 회의실은 이용 중지 상태입니다. 다른 회의실을 선택해 주세요.</p>}
      <div className="room-cards" aria-label="회의실 선택">
        {rooms.map(item => {
          const off = item.status === "BLOCK", selected = item.room_id === roomId;
          return <button key={item.room_id} type="button" disabled={off || busy} className={`room-card${selected ? " selected" : ""}`} aria-pressed={selected}
            onClick={() => { selectPage(item.room_id, 1); setError(""); }}>
            <span className="small">회의실</span><strong className="name">{item.name}</strong>
            <span className="spec">수용 인원 {item.capacity}명</span>
            <span className={`status ${off ? "off" : selected ? "picked" : "ok"}`}>{off ? "이용 중지" : selected ? "선택됨" : "운영 중 · 시간 확인 필요"}</span>
          </button>;
        })}
      </div>
      {!roomsLoading && !roomsError && rooms.length > 0 && !room && <p>현재 이용할 수 있는 회의실이 없습니다.</p>}
      {room && <section className="reservation-schedule" aria-busy={loading}>
        <h2>{room.name} · 오늘 남은 일정</h2>
        <p className="reservation-schedule-description">{today} · 한국 시간 기준 아직 끝나지 않은 예약입니다.</p>
        <div className="reservation-schedule-list">
          {loading && <p role="status">예약 목록을 불러오는 중입니다.</p>}
          {current?.error && <div role="alert"><p>{current.error}</p><button type="button" className="reservation-retry" onClick={() => setRefresh(value => value + 1)}>목록 다시 조회</button></div>}
          {data && data.items.length === 0 && <p className="schedule-empty">{page === 1 ? "오늘 남은 일정이 없습니다." : "이 페이지에 표시할 예약이 없습니다."}</p>}
          {data?.items.map(item => <div key={item.reservation_id} className="schedule-row">
            <span className="time">{timeRange(item.start_at, item.end_at, today)}</span>
            <div><div className="title">{item.title}</div><div className="meta">{item.team} / 참석 {item.participant_count}명{Date.parse(item.start_at) <= now && Date.parse(item.end_at) > now ? " · 진행 중" : ""}</div></div>
          </div>)}
        </div>
        {data && data.total > 0 && <nav className="reservation-pagination" aria-label="예약 목록 페이지">
          <button type="button" disabled={busy || page <= 1} onClick={() => selectPage(roomId, page - 1)}>이전 페이지</button>
          <span>{page} / {Math.max(1, Math.ceil(data.total / data.page_size))} 페이지, 전체 {data.total}건</span>
          <button type="button" disabled={busy || page * data.page_size >= data.total} onClick={() => selectPage(roomId, page + 1)}>다음 페이지</button>
        </nav>}
      </section>}
      {error && <p role="alert" className="book-error">{error}</p>}
      <button type="submit" className="btn reservation-submit" disabled={busy || !room || roomBlocked || roomsLoading || Boolean(roomsError) || availabilityLoading || !validRange || attendeeBusy}>{busy ? "예약 중..." : "예약하기"}</button>
    </form>
  </div>;
}
