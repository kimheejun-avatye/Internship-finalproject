import { post } from "../../shared/api/client";

export type EmailStatus = "AVAILABLE" | "REGISTERED" | "PENDING";
export type Team = "AVATYE" | "GURU";

const BASE = "/api/auth/signup";

export const checkEmail = (email: string) => post<{ status: EmailStatus }>(`${BASE}/check-email`, { email });

export const sendCode = (email: string) =>
  post<{ cooldown_seconds: number; expires_in: number }>(`${BASE}/send-code`, { email });

export const verifyCode = (email: string, code: string) =>
  post<{ signup_token: string; expires_in: number }>(`${BASE}/verify-code`, { email, code });

export interface SignupPayload {
  email: string;
  signup_token: string;
  password: string;
  name: string;
  birth_date: string;
  phone: string;
  team: Team;
  // 연결안: 현재 SignupIn에는 수신·저장 처리가 없어 백엔드 계약 확인이 필요하다.
  position: string;
}

export const signup = (payload: SignupPayload) => post<{ user_id: string; status: "PENDING" }>(BASE, payload);
