import type { ReservationInvitationNotification } from "./notifications.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zoneHour, zoneMinute] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 59
    && (zoneHour === undefined || Number(zoneHour) <= 23 && Number(zoneMinute) <= 59);
}

export function readNotificationEvent(event: unknown): ReservationInvitationNotification | null {
  // 공통 연결에는 채팅 이벤트도 섞여 들어오므로 알림 종류와 필수 데이터만 골라 처리한다.
  if (!isRecord(event) || event.type !== "notification.created" || !isRecord(event.data)) return null;
  return readNotificationData(event.data);
}

export function readNotificationData(data: unknown): ReservationInvitationNotification | null {
  if (!isRecord(data) || data.type !== "reservation.created"
    || typeof data.notification_id !== "string" || !UUID.test(data.notification_id)
    || typeof data.reservation_id !== "string" || !UUID.test(data.reservation_id)
    || typeof data.title !== "string" || !data.title.trim()
    || typeof data.room_name !== "string" || !data.room_name.trim()
    || !isTimestamp(data.start_at) || !isTimestamp(data.end_at) || !isTimestamp(data.created_at)
    || data.read_at != null && !isTimestamp(data.read_at)
    || Date.parse(data.end_at) <= Date.parse(data.start_at)) return null;

  return {
    notification_id: data.notification_id.toLowerCase(),
    type: "reservation.created",
    reservation_id: data.reservation_id.toLowerCase(),
    title: data.title.trim(),
    room_name: data.room_name.trim(),
    start_at: data.start_at,
    end_at: data.end_at,
    created_at: data.created_at,
    read_at: data.read_at ?? null,
  };
}

export function mergeNotification(
  current: ReservationInvitationNotification[],
  incoming: ReservationInvitationNotification,
): ReservationInvitationNotification[] {
  const existing = current.find(item => item.notification_id === incoming.notification_id);
  // 재전송은 같은 항목을 갱신하며, 세션 안에서 읽은 알림을 다시 미읽음으로 되돌리지 않는다.
  const merged = { ...incoming, read_at: existing?.read_at ?? incoming.read_at };
  const next = existing
    ? current.map(item => item.notification_id === incoming.notification_id ? merged : item)
    : [...current, merged];
  return next.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    || b.notification_id.localeCompare(a.notification_id));
}
