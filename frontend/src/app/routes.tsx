import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "../layouts/main/MainLayout";
import AuthLayout from "../layouts/auth/AuthLayout";
import ProtectedRoute from "../features/auth/guards/ProtectedRoute";
import AdminRoute from "../features/admin/guards/AdminRoute";
import LoginPage from "../features/auth/pages/LoginPage";
import SignupPage from "../features/auth/pages/SignupPage";
import PasswordResetPage from "../features/auth/pages/PasswordResetPage";
import PasswordChangePage from "../features/account/pages/PasswordChangePage";
import ReservationPage from "../features/reservations/pages/ReservationPage";
import CalendarPage from "../features/reservations/pages/CalendarPage";
import AdminPage from "../features/admin/pages/AdminPage";

export default function AppRoutes() {
  return <Routes>
    <Route path="/signup" element={<SignupPage />} />
    <Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/password/reset" element={<PasswordResetPage />} />
    </Route>
    <Route element={<ProtectedRoute />}>
      <Route element={<MainLayout />}>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/reservations" element={<ReservationPage />} />
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="/profile" element={<PasswordChangePage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/reservations" replace />} />
  </Routes>;
}
