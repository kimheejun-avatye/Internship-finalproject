import { useState } from "react";

import { RESERVATIONS } from "../mocks/data";

const FIRST_HOUR = 9;
const LAST_HOUR = 18;
const HOUR_PX = 60;
const DOW = ["월", "화", "수", "목", "금"];

function mondayOf(d: Date) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hhmm(h: number) {
  return `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
}

export default function CalendarPage() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const days = DOW.map((_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const friday = days[4];
  const todayIso = iso(new Date());

  function move(weeks: number) {
    setMonday(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weeks * 7));
  }

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
  const sameMonth = monday.getMonth() === friday.getMonth();

  return (
    <>
      <h1 className="page-title">예약 캘린더</h1>

      <div className="card cal-toolbar">
        <h2>
          {monday.getFullYear()}년 {monday.getMonth() + 1}월 {monday.getDate()}일 — {sameMonth ? "" : `${friday.getMonth() + 1}월 `}{friday.getDate()}일
        </h2>
        <div className="cal-nav">
          <button type="button" aria-label="이전 주" onClick={() => move(-1)}>‹</button>
          <button type="button" onClick={() => setMonday(mondayOf(new Date()))}>오늘</button>
          <button type="button" aria-label="다음 주" onClick={() => move(1)}>›</button>
        </div>
      </div>

      <div className="card cal">
        <div>
          <div className="cal-head" />
          <div className="cal-times">
            {hours.map((h) => (
              <span key={h} style={{ top: (h - FIRST_HOUR) * HOUR_PX + (h === FIRST_HOUR ? 8 : 0) }}>{hhmm(h)}</span>
            ))}
          </div>
        </div>
        {days.map((d, i) => {
          const date = iso(d);
          const events = RESERVATIONS.filter((r) => r.date === date);
          return (
            <div key={date}>
              <div className={`cal-head${date === todayIso ? " today" : ""}`}>
                <div className="dow">{DOW[i]}</div>
                <div className="day">{d.getDate()}</div>
              </div>
              <div className="cal-col">
                {events.map((r) => (
                  <div
                    key={r.id}
                    className={`cal-event ${r.mine ? "mine" : "other"}`}
                    style={{ top: (r.start - FIRST_HOUR) * HOUR_PX + 4, height: (r.end - r.start) * HOUR_PX - 8 }}
                  >
                    <div className="t">{r.title}</div>
                    <div className="m">{hhmm(r.start)}–{hhmm(r.end)} · 회의실 {r.roomId}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="legend">
        <span className="mine">내 예약</span>
        <span className="other">다른 구성원의 예약</span>
      </div>
    </>
  );
}
