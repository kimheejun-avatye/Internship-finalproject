// 관리자 API. session-client 가 로그인 세션의 CSRF 헤더를 붙여 준다
import { request } from "./session-client";

export type UserStatus = "PENDING" | "ACTIVE" | "BLOCKED";

export interface AdminUser {
  user_id: string;
  email: string;
  name: string;
  team: "AVATYE" | "GURU";
  role: "ADMIN" | "MEMBER";
  status: UserStatus;
  created_at: string;
  approved_at: string | null;
  blocked_at: string | null;
}

export interface AdminRoom {
  room_id: string;
  name: string;
  status: "ACTIVE" | "BLOCK";
  capacity: number;
  /** 일시 차단이 끝나는 시각. 차단 중이 아니면 null */
  blocked_until: string | null;
}

const BASE = "/api/admin";

export const listUsers = () => request<AdminUser[]>(`${BASE}/users`);
export const approveUser = (id: string) => request<AdminUser>(`${BASE}/users/${id}/approve`, "POST");
export const rejectUser = (id: string) => request<null>(`${BASE}/users/${id}/reject`, "POST");
export const blockUser = (id: string) => request<AdminUser>(`${BASE}/users/${id}/block`, "POST");

export const listRooms = () => request<AdminRoom[]>(`${BASE}/rooms`);
export const blockRoom = (id: string) => request<AdminRoom>(`${BASE}/rooms/${id}/block`, "POST");
