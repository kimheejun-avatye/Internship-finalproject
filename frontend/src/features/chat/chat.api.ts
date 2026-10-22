import { request } from "../../shared/api/session-client";
import type { MessageDto, RoomDetailDto, RoomSummaryDto } from "./chat.types";

// 채팅 REST API. 경로·필드는 백엔드 /api/chat 명세와 같다
export interface Page<T> { items: T[]; next_cursor: string | null }

const ROOMS_PAGE = "50";
const MESSAGES_PAGE = "30";

function withQuery(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `${path}?${search}`;
}
const roomPath = (roomId: string) => `/api/chat/rooms/${encodeURIComponent(roomId)}`;

export const listRooms = (cursor?: string) =>
  request<Page<RoomSummaryDto>>(withQuery("/api/chat/rooms", { limit: ROOMS_PAGE, cursor }));

export const getRoom = (roomId: string) => request<RoomDetailDto>(roomPath(roomId));

// 기존 1:1방이 있으면 그 방을, 없으면 새로 만든 방을 돌려준다
export const openDirectRoom = (targetUserId: string) =>
  request<RoomDetailDto>("/api/chat/rooms/direct", "POST", { target_user_id: targetUserId }, true);

export const createGroupRoom = (memberIds: string[], title: string | null) =>
  request<RoomDetailDto>("/api/chat/rooms/group", "POST", { title, member_ids: memberIds }, true);

// 최신순. cursor 를 주면 그보다 오래된 메시지
export const listMessages = (roomId: string, cursor?: string) =>
  request<Page<MessageDto>>(withQuery(`${roomPath(roomId)}/messages`, { limit: MESSAGES_PAGE, cursor }));

export const postMessage = (roomId: string, message: string, clientId: string) =>
  request<MessageDto>(`${roomPath(roomId)}/messages`, "POST", { message, client_id: clientId }, true);
