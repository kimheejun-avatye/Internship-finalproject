import { post, request } from "../../shared/api/session-client";
import type { SessionInfo, Expiry } from "./auth.types";
export const login = (email: string, password: string) => post<SessionInfo>("/api/auth/login", { email, password });
export const getMe = () => request<SessionInfo>("/api/auth/me");
export const logout = () => post<void>("/api/auth/logout", {});
export const activity = () => post<Expiry>("/api/auth/activity", {});
