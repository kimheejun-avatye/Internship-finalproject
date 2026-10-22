import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRealtime } from "../../shared/realtime/RealtimeProvider";
import { mergeNotification, readNotificationEvent } from "./notifications.state";
import type { ReservationInvitationNotification } from "./notifications.types";
import { getNotifications, markNotificationRead } from "./notifications.api";

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
  // 페이지 이동에는 유지하고 계정이 바뀌면 이전 사용자의 목록을 비운다.
  return <NotificationScope key={props.userId ?? "guest"} {...props} />;
}

function NotificationScope({ userId, children }: Props) {
  const { subscribe } = useRealtime();
  const [notifications, setNotifications] = useState<ReservationInvitationNotification[]>([]);
  const scope = useRef<AbortController | null>(null);
  const pendingReads = useRef(new Set<string>());
  const retentionLimit = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const session = new AbortController();
    scope.current = session;
    let query: AbortController | null = null;
    const load = async () => {
      query?.abort();
      const current = new AbortController();
      query = current;
      const abort = () => current.abort();
      session.signal.addEventListener("abort", abort, { once: true });
      try {
        const result = await getNotifications(current.signal);
        if (active && !current.signal.aborted) {
          retentionLimit.current = result.retention_limit;
          // 조회 중 받은 실시간 알림과 이미 확인한 읽음 상태를 유지한다.
          setNotifications(items => result.items.reduce(mergeNotification, items).slice(0, result.retention_limit));
        }
      } catch {
        // 조회 실패 시 현재 목록을 유지하고 다음 연결의 ready 이벤트에서 다시 조회한다.
      } finally {
        session.signal.removeEventListener("abort", abort);
      }
    };
    const unsubscribe = subscribe(event => {
      if (!active) return;
      if (event.type === "ready") { void load(); return; }
      const incoming = readNotificationEvent(event);
      if (incoming) setNotifications(current => mergeNotification(current, incoming).slice(0, retentionLimit.current ?? undefined));
    });
    void load();
    return () => {
      active = false;
      session.abort();
      query?.abort();
      unsubscribe();
    };
  }, [subscribe, userId]);

  const markRead = useCallback((notificationId: string) => {
    const item = notifications.find(item => item.notification_id === notificationId);
    const signal = scope.current?.signal;
    if (!item || item.read_at || !signal || signal.aborted || pendingReads.current.has(notificationId)) return;
    pendingReads.current.add(notificationId);
    void markNotificationRead(notificationId, signal).then(result => {
      if (!signal.aborted) setNotifications(current => current.map(item => item.notification_id === notificationId
        ? { ...item, read_at: result.read_at } : item));
    }).catch(() => {
      // 저장 실패 시 안 읽음 상태를 유지하고 다음 클릭 때 다시 요청한다.
    }).finally(() => pendingReads.current.delete(notificationId));
  }, [notifications]);
  const value = useMemo(() => ({
    notifications,
    unreadCount: notifications.filter(item => item.read_at === null).length,
    markRead,
  }), [notifications, markRead]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
