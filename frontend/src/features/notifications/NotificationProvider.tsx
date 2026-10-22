import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRealtime } from "../../shared/realtime/RealtimeProvider";
import { mergeNotification, readNotificationEvent } from "./notifications.state";
import type { ReservationInvitationNotification } from "./notifications.types";

type Notifications = {
  notifications: ReservationInvitationNotification[];
  unreadCount: number;
  markRead: (notificationId: string) => void;
};
type Props = { userId: string | null; children: ReactNode };
const Context = createContext<Notifications | null>(null);

export function useNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error("NotificationProvider is missing");
  return value;
}

export function NotificationProvider(props: Props) {
  // 페이지 이동에는 유지하고, 로그아웃·계정 변경 때만 이전 사용자의 목록과 읽음 상태를 폐기한다.
  return <NotificationScope key={props.userId ?? "guest"} {...props} />;
}

function NotificationScope({ userId, children }: Props) {
  const { subscribe } = useRealtime();
  const [notifications, setNotifications] = useState<ReservationInvitationNotification[]>([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const unsubscribe = subscribe(event => {
      if (!active) return;
      const incoming = readNotificationEvent(event);
      if (incoming) setNotifications(current => mergeNotification(current, incoming));
    });
    return () => {
      // 종료된 계정의 지연 이벤트가 다음 계정의 화면에 들어오지 않도록 구독도 함께 정리한다.
      active = false;
      unsubscribe();
    };
  }, [subscribe, userId]);

  const markRead = useCallback((notificationId: string) => {
    // 읽음 API 연결 전에는 현재 브라우저 세션의 메모리만 바꾸며 서버 저장을 가정하지 않는다.
    setNotifications(current => current.map(item => item.notification_id === notificationId && item.read_at === null
      ? { ...item, read_at: new Date().toISOString() } : item));
  }, []);
  const value = useMemo(() => ({
    notifications,
    unreadCount: notifications.filter(item => item.read_at === null).length,
    markRead,
  }), [notifications, markRead]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
