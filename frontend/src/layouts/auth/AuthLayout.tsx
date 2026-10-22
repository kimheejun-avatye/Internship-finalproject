import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
export default function AuthLayout() {
  const { session, loading } = useAuth();
  if (loading) return <p role="status" className="status-page">로그인 상태를 확인하고 있습니다.</p>;
  if (session) return <Navigate to="/reservations" replace />;
  return <main className="auth-page"><Outlet /></main>;
}
