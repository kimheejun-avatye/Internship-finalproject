import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { startRealtime, subscribeRealtime, subscribeRealtimeStatus, type RealtimeStatus } from "./realtime";

const Context = createContext<{ subscribe: typeof subscribeRealtime; status: RealtimeStatus } | null>(null);

export function useRealtime() {
  const value = useContext(Context);
  if (!value) throw new Error("RealtimeProvider is missing");
  return value;
}

export function RealtimeProvider({ userId, onAuthLost, children }: {
  userId: string | null; onAuthLost: () => void; children: ReactNode;
}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  useEffect(() => subscribeRealtimeStatus(setStatus), []);
  useEffect(() => {
    if (!userId) return;
    // 인증 확인 후 연결하며 로그아웃·계정 변경 시 소켓과 모든 연결 타이머를 정리한다.
    return startRealtime(onAuthLost);
  }, [userId, onAuthLost]);
  return <Context.Provider value={{ subscribe: subscribeRealtime, status }}>{children}</Context.Provider>;
}
