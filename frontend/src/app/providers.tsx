import { useCallback, type ReactNode } from "react";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";
import { UserDirectoryProvider } from "../shared/users/UserDirectoryProvider";
import { RealtimeProvider } from "../shared/realtime/RealtimeProvider";
import { NotificationProvider } from "../features/notifications/NotificationProvider";

function SessionDirectory({ children }: { children: ReactNode }) {
  const { session, loading, clear } = useAuth();
  const userId = !loading ? session?.user.user_id ?? null : null;
  const authLost = useCallback(() => clear("로그인이 만료되었거나 종료되었습니다. 다시 로그인해주세요."), [clear]);
  // 라우트 바깥에서 유지하고 계정이 바뀔 때만 이전 사용자의 알림·구독·화면 상태를 비운다.
  return <RealtimeProvider key={userId ?? "guest"} userId={userId} onAuthLost={authLost}>
    <NotificationProvider userId={userId}>
      <UserDirectoryProvider userId={userId}>{children}</UserDirectoryProvider>
    </NotificationProvider>
  </RealtimeProvider>;
}

export function AuthenticatedProviders({ children }: { children: ReactNode }) {
  return <AuthProvider><SessionDirectory>{children}</SessionDirectory></AuthProvider>;
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return <AuthenticatedProviders>{children}</AuthenticatedProviders>;
}
