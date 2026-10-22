import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../../../shared/ui/Logo";
import { useAuth } from "../AuthProvider";
import { ApiError } from "../../../shared/api/client";

export default function LoginPage() {
  const { login, notice } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      await login(email.trim().toLowerCase(), password);
      navigate("/reservations", { replace: true });
    } catch (e) {
      const wait = e instanceof ApiError && e.extra.retryAfter ? ` ${Math.ceil(e.extra.retryAfter / 60)}분 후 다시 시도해주세요.` : "";
      setError((e instanceof Error ? e.message : "로그인에 실패했습니다.") + wait);
    } finally { setBusy(false); }
  }
  return <form className="auth-box" onSubmit={submit}>
    <Logo className="auth-logo large" /><p className="auth-subtitle">회의실 예약 시스템</p>
    <div className="field"><label htmlFor="email">아이디</label><div className="input-wrap"><input id="email" type="email" required placeholder="회사 이메일" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></div></div>
    <div className="field"><label htmlFor="password">비밀번호</label><div className="input-wrap"><input id="password" type="password" required maxLength={128} placeholder="비밀번호" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div></div>
    {(error || notice) && <p role={error ? "alert" : "status"} className={error ? "form-error" : "hint"}>{error || notice}</p>}
    <button type="submit" className="btn full-width" disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
    <div className="auth-links"><Link to="/signup" className="primary text-link">회원가입</Link><span className="divider" /><Link to="/password/reset" className="muted text-link">비밀번호 찾기</Link></div>
  </form>;
}
