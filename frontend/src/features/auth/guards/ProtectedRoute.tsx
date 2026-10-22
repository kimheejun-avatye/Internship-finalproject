import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../AuthProvider";

export default function ProtectedRoute() {
  const { session, loading, error, reloadMe } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status" className="status-page">로그인 상태를 확인하고 있습니다.</p>;
  if (error) return <div className="status-page" role="alert"><p>{error}</p><button onClick={() => void reloadMe()}>다시 확인</button></div>;
  return session ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
}
