import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Link } from "react-router-dom";
import { useRealtime } from "../../../shared/realtime/RealtimeProvider";
import pointerBorder from "../../../assets/notification-pointer-border.svg";
import pointerFill from "../../../assets/notification-pointer-fill.svg";
import { useNotifications } from "../NotificationProvider";
import type { ReservationInvitationNotification } from "../notifications.types";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short",
});
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});

function seoulDay(value: string) {
  const parts = dayFormat.formatToParts(new Date(value));
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarLink(notification: ReservationInvitationNotification) {
  const date = seoulDay(notification.start_at);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  // 주간 화면은 평일만 표시하므로 주말 초대는 해당 월에서 찾을 수 있도록 이동한다.
  const view = weekday === 0 || weekday === 6 ? "month" : "week";
  return `/calendar?${new URLSearchParams({ date, view, scope: "all" })}`;
}

export default function NotificationPanel({ id, anchorRef, onNavigate }: { id: string; anchorRef: RefObject<HTMLButtonElement | null>; onNavigate: () => void }) {
  const { notifications, unreadCount, markRead } = useNotifications();
  const { status } = useRealtime();
  const heading = useRef<HTMLHeadingElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 82, pointer: 160 });
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(320, Math.max(0, window.innerWidth - 32));
      const center = anchor.left + anchor.width / 2;
      const left = Math.max(16, Math.min(center - width / 2, window.innerWidth - width - 16));
      const top = anchor.bottom + 20;
      const pointer = Math.max(16, Math.min(center - left, width - 16));
      setPosition(current => current.left === left && current.top === top && current.pointer === pointer ? current : { left, top, pointer });
    };
    // 본문 최소 너비 때문에 가로 스크롤이 생겨도 패널은 현재 보이는 화면 안에 두고 종 위치를 따라간다.
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);
  useEffect(() => { heading.current?.focus(); }, []);

  const style = { left: position.left, top: position.top, "--notification-pointer-center": `${position.pointer}px` } as CSSProperties;
  return <section className="notification-panel" style={style} id={id} role="dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-scope`}>
    <img className="notification-pointer notification-pointer-border" src={pointerBorder} alt="" aria-hidden="true" />
    <img className="notification-pointer notification-pointer-fill" src={pointerFill} alt="" aria-hidden="true" />
    <div className="notification-panel-heading">
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>알림</h2>
      <span className="notification-new-count">새 알림 {unreadCount}</span>
    </div>
    <p className="notification-panel-description">{notifications.length ? "회의 예약 알림이 있습니다" : "받은 알림이 없습니다"}</p>
    {status === "reconnecting" && <p className="notification-connection" role="status">실시간 연결을 다시 시도하고 있습니다.</p>}
    {status === "stopped" && <p className="notification-connection" role="status">실시간 연결이 중단되었습니다. 새로고침 후 다시 확인해 주세요.</p>}
    {notifications.length > 0 && <ul className="notification-list" aria-label="회의 초대 알림 목록">
      {notifications.map(notification => {
        const start = new Date(notification.start_at), end = new Date(notification.end_at);
        const crossDay = seoulDay(notification.start_at) !== seoulDay(notification.end_at);
        return <li key={notification.notification_id}>
          <Link className={`notification-card${notification.read_at ? " is-read" : ""}`} to={calendarLink(notification)} onClick={() => {
            // 상세 조회 없이 수신 데이터로 이동하며, 읽음은 현재 접속의 메모리 상태에만 반영한다.
            markRead(notification.notification_id);
            onNavigate();
          }}>
            <div className="notification-card-heading"><strong>{notification.title}</strong><span className="notification-read-state">{notification.read_at ? "읽음" : "안 읽음"}</span></div>
            <dl>
              <div><dt>날짜</dt><dd>{dateFormat.format(start)}{crossDay ? ` – ${dateFormat.format(end)}` : ""}</dd></div>
              <div><dt>시간</dt><dd><time dateTime={notification.start_at}>{timeFormat.format(start)}</time>–<time dateTime={notification.end_at}>{timeFormat.format(end)}</time>{crossDay && " (종료일)"}</dd></div>
              <div><dt>회의실</dt><dd>{notification.room_name}</dd></div>
            </dl>
          </Link>
        </li>;
      })}
    </ul>}
    <p className="notification-session-note" id={`${id}-scope`}>이번 접속에서 받은 알림 · 한국 시간 기준</p>
  </section>;
}
