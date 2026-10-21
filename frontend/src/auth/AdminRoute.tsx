import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

/** ADMIN 만 통과시킨다. 로그인 여부는 바깥의 ProtectedRoute 가 먼저 확인한다 */
export default function AdminRoute() {
  const { session } = useAuth();
  return session?.user.role === "ADMIN" ? <Outlet /> : <Navigate to="/reservations" replace />;
}
