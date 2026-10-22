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
  // 부서/직무를 하나의 문자열로 보내고, 서버가 필수 검증 후 users.position에 저장한다.
  position: string;
}

export const signup = (payload: SignupPayload) => post<{ user_id: string; status: "PENDING" }>(BASE, payload);
