import { FormEvent, useMemo, useState } from "react";

import { RESERVATIONS, ROOMS, type Reservation } from "../mocks/data";

const TODAY = "2026-10-16";
const HOURS = Array.from({ length: 10 }, (_, i) => 9 + i); // 09 ~ 18

function hhmm(h: number) {
  const hour = Math.floor(h);
  const min = h % 1 ? "30" : "00";
  return `${String(hour).padStart(2, "0")}:${min}`;
}

export default function ReservationPage() {
  const [roomId, setRoomId] = useState("A");
  const [reservations, setReservations] = useState<Reservation[]>(RESERVATIONS);
  const [start, setStart] = useState(13);
  const [end, setEnd] = useState(14);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const room = ROOMS.find((r) => r.id === roomId)!;
  const schedule = useMemo(
    () => reservations.filter((r) => r.roomId === roomId && r.date === TODAY).sort((a, b) => a.start - b.start),
    [reservations, roomId],
  );
  const available = ROOMS.filter((r) => r.status === "ACTIVE").length;

  function book(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("회의 제목을 입력해 주세요.");
    if (end <= start) return setError("종료 시간은 시작 시간보다 늦어야 합니다.");
    if (schedule.some((r) => start < r.end && r.start < end)) return setError("이미 예약된 시간과 겹칩니다.");
    setReservations([
      ...reservations,
      { id: crypto.randomUUID(), roomId, date: TODAY, start, end, title: title.trim(), team: "내 예약", people: 1, mine: true },
    ]);
    setTitle("");
    setError("");
  }

  return (
    <>
      <h1 className="page-title">회의실 예약</h1>

      <div className="card filter-bar">
        <div className="filter-item">
          <div className="label">예약 날짜</div>
          <div className="value">2026. 10. 16 금요일</div>
        </div>
        <div className="filter-divider" />
        <div className="filter-item">
          <div className="label">인원</div>
          <div className="value">4명 이상</div>
        </div>
        <span className="chip green">예약 가능 {available}개</span>
      </div>

      <div className="room-cards">
        {ROOMS.map((r) => {
          const off = r.status === "MAINTENANCE";
          const selected = r.id === roomId;
          return (
            <button key={r.id} type="button" disabled={off} className={`room-card${selected ? " selected" : ""}`} onClick={() => setRoomId(r.id)}>
              <span className="small">회의실</span>
              <span className="letter">{r.letter}</span>
              <span className="name">회의실 {r.letter}</span>
              <span className="spec">{[`${r.capacity}인`, ...r.features].join(" · ")}</span>
              <span className={`status ${off ? "off" : selected ? "picked" : "ok"}`}>
                {off ? "점검 중" : selected ? "● 선택됨" : "예약 가능"}
              </span>
            </button>
          );
        })}
      </div>

      <section className="card schedule">
        <h2>회의실 {room.letter} · 오늘의 일정</h2>
        <p className="sub">예약된 시간을 확인하고 빈 시간을 선택하세요.</p>
        {schedule.length === 0 && <p className="schedule-empty">오늘 예약이 없습니다.</p>}
        {schedule.map((r) => (
          <div key={r.id} className="schedule-row">
            <span className="time">{hhmm(r.start)}–{hhmm(r.end)}</span>
            <div>
              <div className="title">{r.title}</div>
              <div className="meta">{r.team} · {r.people}명</div>
            </div>
          </div>
        ))}

        <form className="book-form" onSubmit={book}>
          <label>시작
            <select value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {HOURS.slice(0, -1).map((h) => <option key={h} value={h}>{hhmm(h)}</option>)}
            </select>
          </label>
          <label>종료
            <select value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {HOURS.slice(1).map((h) => <option key={h} value={h}>{hhmm(h)}</option>)}
            </select>
          </label>
          <label>회의 제목
            <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="회의 제목" />
          </label>
          <button type="submit" className="btn">예약하기</button>
          {error && <p className="book-error">{error}</p>}
        </form>
      </section>
    </>
  );
}
