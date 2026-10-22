import { useState } from "react";
import { useAuth } from "../../features/auth/AuthProvider";
import { NavLink, Outlet } from "react-router-dom";

import Logo from "../../shared/ui/Logo";

const MENU = [
  { to: "/reservations", label: "예약하기" },
  { to: "/calendar", label: "캘린더" },
  { to: "/admin", label: "관리자", adminOnly: true },
  { to: "/profile", label: "비밀번호 변경" },
];

export default function MainLayout() {
  const { logout, session } = useAuth();
  const menu = MENU.filter((item) => !item.adminOnly || session?.user.role === "ADMIN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function exit() {
    setBusy(true); setError("");
    try { await logout(); }
    catch (e) { setError(e instanceof Error ? e.message : "로그아웃에 실패했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <div className="app">
      <header className="app-header">
        <Logo />
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <nav>
            {menu.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          {error && <p role="alert">{error}</p>}
          <button type="button" className="logout" disabled={busy} onClick={() => void exit()}>
            로그아웃
          </button>
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
