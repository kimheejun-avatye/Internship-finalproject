import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../AuthProvider";

export default function LoggedOutRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return <p role="status" className="status-page">로그인 상태를 확인하고 있습니다.</p>;
  }

  return session ? <Navigate to="/calendar" replace /> : <Outlet />;
}
