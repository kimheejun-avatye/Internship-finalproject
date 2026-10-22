import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { useNotifications } from "../../features/notifications/NotificationProvider";
import NotificationPanel from "../../features/notifications/components/NotificationPanel";
import Logo from "../../shared/ui/Logo";
import bellIcon from "../../assets/main-bell.svg";
import logoutIcon from "../../assets/main-logout.svg";
import "../../features/notifications/notifications.css";

export default function MainHeader() {
  const { logout, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loggingOut = useRef(false);
  const { unreadCount } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationControl = useRef<HTMLDivElement>(null);
  const notificationButton = useRef<HTMLButtonElement>(null);
  const notificationPanelId = useId();
  const location = useLocation();

  useEffect(() => { setNotificationsOpen(false); }, [location.key]);
  useEffect(() => {
    if (!notificationsOpen) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !notificationControl.current?.contains(event.target)) setNotificationsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setNotificationsOpen(false);
      notificationButton.current?.focus();
    };
    // 패널은 모달이 아니므로 바깥 클릭과 키보드 이동을 허용하고, Escape 때만 종 버튼으로 초점을 돌린다.
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [notificationsOpen]);

  async function exit() {
    if (loggingOut.current) return;
    loggingOut.current = true;
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그아웃에 실패했습니다.");
    } finally {
      loggingOut.current = false;
      setBusy(false);
    }
  }

  return (
    <header className="app-header">
      <Link to="/calendar" className="main-brand" aria-label="캘린더 홈">
        <Logo />
        <span>회의실</span>
      </Link>
      <div className="main-header-account">
        <Link to="/profile" className="main-account-link" aria-label="계정" title={session?.user.email}>
          <span className="main-account-name">{session?.user.name || session?.user.email}</span>
          <span className="main-account-label" title={session?.user.position?.trim() || undefined}>{session?.user.position?.trim() || "부서/직무 미등록"}</span>
        </Link>
        <div className="notification-control" ref={notificationControl}>
          <button ref={notificationButton} type="button" className="main-notifications" aria-label={`알림, 안 읽은 알림 ${unreadCount}개`} aria-haspopup="dialog" aria-expanded={notificationsOpen} aria-controls={notificationsOpen ? notificationPanelId : undefined} onClick={() => setNotificationsOpen(open => !open)}>
            <img src={bellIcon} alt="" />
            {unreadCount > 0 && <span className="notification-unread-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </button>
          <span className="notification-sr-only" role="status">{unreadCount > 0 ? `이번 접속에서 받은 안 읽은 알림 ${unreadCount}개` : "안 읽은 알림이 없습니다"}</span>
          {notificationsOpen && <NotificationPanel id={notificationPanelId} anchorRef={notificationButton} onNavigate={() => setNotificationsOpen(false)} />}
        </div>
        {session?.user.role === "ADMIN" && <NavLink to="/admin" className="main-header-admin">관리자</NavLink>}
        <span className="main-header-divider" aria-hidden="true" />
        <button type="button" className="main-header-logout" disabled={busy} onClick={() => void exit()}>
          <img src={logoutIcon} alt="" />
          {busy ? "로그아웃 중…" : "로그아웃"}
        </button>
      </div>
      {error && <p role="alert" className="main-header-error">{error}</p>}
    </header>
  );
}
