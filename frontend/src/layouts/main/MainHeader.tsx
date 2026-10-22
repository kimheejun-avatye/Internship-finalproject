import { useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import Logo from "../../shared/ui/Logo";
import bellIcon from "../../assets/main-bell.svg";
import logoutIcon from "../../assets/main-logout.svg";

export default function MainHeader() {
  const { logout, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loggingOut = useRef(false);

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
          <span className="main-account-label">계정</span>
        </Link>
        <button type="button" className="main-notifications" disabled aria-label="알림 (준비 중)" title="알림 기능 준비 중">
          <img src={bellIcon} alt="" />
        </button>
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
