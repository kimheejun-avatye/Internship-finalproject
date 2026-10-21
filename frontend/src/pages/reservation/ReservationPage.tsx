import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import * as api from "../../shared/api/reservations";
import { ApiError } from "../../shared/api/client";

function inSeoul(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

function defaultStart(): Date {
  return new Date(Math.ceil((Date.now() + 5 * 60_000) / (5 * 60_000)) * (5 * 60_000));
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.extra.fields) {
    return Object.values(error.extra.fields).join(" ");
  }
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function timeLabel(value: string): string {
  const date = inSeoul(new Date(value));
  return date.slice(11);
}

type Listing = { roomId: string; page: number; data: api.ReservationList | null; error: string };

export default function ReservationPage() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const [params, setParams] = useSearchParams();
  const [rooms, setRooms] = useState<api.Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const [roomRetry, setRoomRetry] = useState(0);
  const [listing, setListing] = useState<Listing | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [start, setStart] = useState(() => inSeoul(defaultStart()));
  const [end, setEnd] = useState(() => inSeoul(new Date(defaultStart().getTime() + 30 * 60_000)));
  const [title, setTitle] = useState("");
  // TODO: 날짜 선택 state, 가능 시간 슬롯 state(api.getAvailability), 선택 참여자 state 추가
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const today = inSeoul(new Date(Date.now())).slice(0, 10);
  const room = rooms.find(item => item.room_id === params.get("room_id") && item.status === "ACTIVE")
    ?? rooms.find(item => item.status === "ACTIVE");
  const roomId = room?.room_id ?? null;
  const requestedPage = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const current = listing?.roomId === roomId && listing.page === page ? listing : null;
  const loading = roomId !== null && (!current || (!current.data && !current.error));
  const data = current?.data;
  const available = rooms.filter(item => item.status === "ACTIVE").length;

  useEffect(() => {
    let active = true;
    setRoomsLoading(true);
    setRoomsError("");
    api.listRooms().then(
      values => { if (active) setRooms(values); },
      failure => { if (active) setRoomsError(errorMessage(failure)); },
    ).finally(() => { if (active) setRoomsLoading(false); });
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
  }, [roomId, page, refresh]);

  function selectPage(selectedRoom: string, selectedPage: number) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set("room_id", selectedRoom);
      next.set("page", String(selectedPage));
      return next;
    }, { replace: true });
  }

  async function book(event: FormEvent) {
    event.preventDefault();
    if (busy || !roomId) return;
    setError("");
    setSuccess("");
    if (!title.trim()) return setError("회의 제목을 입력해 주세요.");
    const startAt = start + ":00+09:00";
    const endAt = end + ":00+09:00";
    const startTime = new Date(startAt).getTime();
    const endTime = new Date(endAt).getTime();
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return setError("시작과 종료 시각을 입력해 주세요.");
    }
    if (endTime <= startTime) return setError("종료 시간은 시작 시간보다 늦어야 합니다.");
    if (startTime < Date.now()) return setError("시작 시각은 과거일 수 없습니다.");

    setBusy(true);
    try {
      await api.createReservation({ room_id: roomId, title: title.trim(), start_at: startAt, end_at: endAt });
      if (!mounted.current) return;
      setTitle("");
      setSuccess(start.slice(0, 10) === today
        ? "예약이 저장되었습니다."
        : `예약이 저장되었습니다. ${start.slice(0, 10)} 예약은 해당 날짜의 오늘 목록에서 확인할 수 있습니다.`);
      setListing(null);
      selectPage(roomId, 1);
      setRefresh(value => value + 1);
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">회의실 예약</h1>
      <div className="card filter-bar">
        <div className="filter-item">
          <div className="label">오늘 날짜 (한국 시간)</div>
          <div className="value">{today}</div>
        </div>
        <div className="filter-divider" />
        <div className="filter-item">
          <div className="label">선택 회의실 수용 인원</div>
          <div className="value">{room ? `${room.capacity}명` : "-"}</div>
        </div>
        <span className="chip green">예약 가능 {available}개</span>
      </div>

      {roomsLoading && <p>회의실을 불러오는 중입니다.</p>}
      {roomsError && <div role="alert">
        <p>{roomsError}</p>
        <button type="button" className="btn" onClick={() => setRoomRetry(value => value + 1)}>회의실 다시 조회</button>
      </div>}
      {!roomsLoading && !roomsError && rooms.length === 0 && <p>등록된 회의실이 없습니다.</p>}
      <div className="room-cards">
        {rooms.map((item, index) => {
          const off = item.status === "BLOCK";
          const selected = item.room_id === roomId;
          return <button key={item.room_id} type="button" disabled={off || busy}
            className={`room-card${selected ? " selected" : ""}`}
            aria-pressed={selected}
            onClick={() => { selectPage(item.room_id, 1); setError(""); setSuccess(""); }}>
            <span className="small">회의실</span>
            <span className="letter">{index + 1}</span>
            <span className="name">{item.name}</span>
            <span className="spec">수용 인원 {item.capacity}명</span>
            <span className={`status ${off ? "off" : selected ? "picked" : "ok"}`}>
              {off ? "예약 중지" : selected ? "선택됨" : "예약 가능"}
            </span>
          </button>;
        })}
      </div>

      {!roomsLoading && !roomsError && rooms.length > 0 && !room && <p>현재 예약 가능한 회의실이 없습니다.</p>}
      {room && <section className="card schedule" aria-busy={loading}>
        <h2>{room.name} - 오늘의 일정</h2>
        <p className="sub">목록에는 한국 시간 기준 오늘의 종료되지 않은 예약을 표시합니다.</p>
        {loading && <p>예약 목록을 불러오는 중입니다.</p>}
        {current?.error && <div role="alert">
          <p>{current.error}</p>
          <button type="button" className="btn" onClick={() => setRefresh(value => value + 1)}>목록 다시 조회</button>
        </div>}
        {data && data.items.length === 0 && <p className="schedule-empty">이 페이지에 표시할 예약이 없습니다.</p>}
        {data?.items.map(item => <div key={item.reservation_id} className="schedule-row">
          <span className="time">{timeLabel(item.start_at)}–{timeLabel(item.end_at)}</span>
          <div>
            <div className="title">{item.title}</div>
            <div className="meta">{item.team} / 참석 {item.participant_count}명</div>
          </div>
        </div>)}
        {data && data.total > 0 && <nav className="reservation-pagination" aria-label="예약 목록 페이지">
          <button type="button" disabled={busy || page <= 1} onClick={() => selectPage(roomId!, page - 1)}>이전 페이지</button>
          <span>{page} / {Math.max(1, Math.ceil(data.total / data.page_size))} 페이지, 전체 {data.total}건</span>
          <button type="button" disabled={busy || page * data.page_size >= data.total}
            onClick={() => selectPage(roomId!, page + 1)}>다음 페이지</button>
        </nav>}
        {/* TODO: 날짜 선택 + 가능 시간 슬롯 버튼. 클릭하면 setStart/setEnd로 아래 입력칸을 채운다. */}
        <form className="book-form" onSubmit={book}>
          <label>시작 (한국 시간)
            <input type="datetime-local" required value={start} disabled={busy}
              onChange={event => setStart(event.target.value)} />
          </label>
          <label>종료 (한국 시간)
            <input type="datetime-local" required value={end} disabled={busy}
              onChange={event => setEnd(event.target.value)} />
          </label>
          <label>회의 제목
            <input className="title-input" required value={title} disabled={busy}
              onChange={event => setTitle(event.target.value)} placeholder="회의 제목" />
          </label>
          {/* TODO: 참여자 입력·선택 목록(사용자 검색 API는 채팅 쪽과 겹쳐 보류), 정원(room.capacity) 초과 안내 */}
          <button type="submit" className="btn" disabled={busy || loading}>{busy ? "예약 중..." : "예약하기"}</button>
          {error && <p role="alert" className="book-error">{error}</p>}
          {success && <p role="status" className="book-success">{success}</p>}
        </form>
      </section>}
    </>
  );
}
