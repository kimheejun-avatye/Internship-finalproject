import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as api from "./auth.api";
import { ApiError, setCsrfToken } from "../../shared/api/session-client";
import type { SessionInfo, Expiry } from "./auth.types";
import { useSessionActivity } from "./hooks/useSessionActivity";

type Auth = {
  session: SessionInfo | null; loading: boolean; error: string; notice: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>; reloadMe: () => Promise<void>; clear: (message?: string) => void;
};
const Context = createContext<Auth | null>(null);
export function useAuth() { const value = useContext(Context); if (!value) throw Error("AuthProvider is missing"); return value; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const hadSession = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const accept = useCallback((data: SessionInfo) => { hadSession.current = true; setCsrfToken(data.csrf_token); setSession(data); setError(""); setNotice(""); }, []);
  const clearLocal = useCallback((message = "") => { generation.current++; hadSession.current = false; setCsrfToken(""); setSession(null); setNotice(message); setError(""); }, []);
  const clear = useCallback((message = "") => { clearLocal(message); channel.current?.postMessage("changed"); }, [clearLocal]);
  const reloadMe = useCallback(async () => {
    const id = ++generation.current;
    try { const data = await api.getMe(); if (id === generation.current) accept(data); }
    catch (e) {
      if (id !== generation.current) return;
      if (e instanceof ApiError && (e.status === 401 || e.code === "USER_BLOCKED" || e.code === "USER_PENDING")) clearLocal(hadSession.current ? "로그인이 만료되었거나 종료되었습니다. 다시 로그인해주세요." : "");
      else setError(e instanceof Error ? e.message : "로그인 상태 확인에 실패했습니다.");
    } finally { setLoading(false); }
  }, [accept, clearLocal]);
  useEffect(() => {
    void reloadMe();
    const lost = (e: Event) => clearLocal((e as CustomEvent<string>).detail || "다시 로그인해주세요.");
    window.addEventListener("auth:lost", lost);
    if (typeof BroadcastChannel !== "undefined") { const c = new BroadcastChannel("meeting-auth"); channel.current = c; c.onmessage = () => { void reloadMe(); }; }
    const visible = () => { if (document.visibilityState === "visible") void reloadMe(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("auth:lost", lost); document.removeEventListener("visibilitychange", visible); channel.current?.close(); channel.current = null; };
  }, [reloadMe, clearLocal]);
  useEffect(() => {
    if (!session) return;
    const timeout = Math.max(100, new Date(session.idle_expires_at).getTime() - Date.now() + 100);
    const timer = window.setTimeout(() => { void reloadMe(); }, timeout);
    return () => window.clearTimeout(timer);
  }, [session, reloadMe]);
  const updateExpiry = useCallback((expiry: Expiry) => setSession(prev => prev ? { ...prev, ...expiry } : prev), []);
  useSessionActivity(Boolean(session), updateExpiry);
  const login = async (email: string, password: string) => { generation.current++; accept(await api.login(email, password)); channel.current?.postMessage("changed"); };
  const logout = async () => { await api.logout(); clear("로그아웃했습니다."); };
  return <Context.Provider value={{ session, loading, error, notice, login, logout, reloadMe, clear }}>{children}</Context.Provider>;
}
