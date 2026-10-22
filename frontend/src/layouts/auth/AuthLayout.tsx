import { Outlet, useLocation } from "react-router-dom";
import Logo from "../../shared/ui/Logo";

const variants: Record<string, string> = {
  "/login": "login",
  "/signup": "signup",
  "/password/reset": "reset",
  "/profile": "change",
};

export default function AuthLayout() {
  const { pathname } = useLocation();
  return <main className={`auth-page auth-page--${variants[pathname] ?? "login"}`}>
    <div className="auth-content">
      <Logo className="auth-logo" />
      <Outlet />
    </div>
  </main>;
}
