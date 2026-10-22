import { request } from "../../shared/api/session-client";
import { readNotificationData } from "./notifications.state";
import type { ReservationInvitationNotification } from "./notifications.types";

export async function getNotifications(signal: AbortSignal) {
  const result = await request<{ items: unknown[]; retention_limit: number }>("/api/notifications", "GET", undefined, false, signal);
  if (!Array.isArray(result?.items) || !Number.isInteger(result.retention_limit) || result.retention_limit < 1) {
    throw new Error("알림을 불러오지 못했습니다. 다시 시도해 주세요.");
  }
  const items: ReservationInvitationNotification[] = result.items.map(value => {
    const item = readNotificationData(value);
    if (!item) throw new Error("알림을 불러오지 못했습니다. 다시 시도해 주세요.");
    return item;
  });
  return { items, retention_limit: result.retention_limit };
}

export async function markNotificationRead(id: string, signal: AbortSignal) {
  const result = await request<{ notification_id: string; read_at: string }>(
    `/api/notifications/${id}/read`, "PATCH", {}, true, signal,
  );
  if (result?.notification_id !== id || typeof result.read_at !== "string" || !Number.isFinite(Date.parse(result.read_at))) {
    throw new Error("읽음 상태를 저장하지 못했습니다. 다시 시도해 주세요.");
  }
  return result;
}
