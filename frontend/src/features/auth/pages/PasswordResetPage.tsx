import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../../../shared/ui/Logo";
import { sendResetCode, verifyResetCode, resetPassword } from "../password-reset.api";
import { ApiError } from "../../../shared/api/client";
import { validatePassword } from "../validation";
import { useCountdown } from "../../../shared/hooks/useCountdown";
export default function PasswordResetPage() {
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [token, setToken] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false); const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const cooldown = useCountdown();
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await work(); } catch (e) { setError((e as Error).message); if (e instanceof ApiError && e.extra.retryAfter) cooldown.start(e.extra.retryAfter); if (e instanceof ApiError && e.code === "INVALID_RESET_TOKEN") { setToken(""); setSent(false); } } finally { setBusy(false); } }
  const send = () => run(async () => { const res = await sendResetCode(email.trim().toLowerCase()); setSent(true); setToken(""); setCode(""); cooldown.start(res.cooldown_seconds); setMessage(res.message); });
  const verify = () => run(async () => { if (!/^\d{6}$/.test(code)) throw Error("인증번호 6자리를 입력해주세요."); const res = await verifyResetCode(email.trim().toLowerCase(), code); setToken(res.reset_token); setMessage("이메일 인증이 완료되었습니다."); });
  const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { const problem = validatePassword(password); if (problem) throw Error(problem); if (password !== confirm) throw Error("새 비밀번호가 일치하지 않습니다."); await resetPassword(token, password); setDone(true); }); };
  return <form className="auth-box signup" onSubmit={submit}><Logo className="auth-logo small" /><h1>비밀번호 재설정</h1>
    {done ? <><p className="notice">비밀번호를 재설정하고 모든 로그인을 종료했습니다.</p><Link to="/login" className="btn link-btn">로그인으로 돌아가기</Link></> : <>
      <div className="field"><label htmlFor="reset-email">이메일</label><div className="input-wrap"><input id="reset-email" type="email" required autoComplete="username" value={email} disabled={busy} onChange={e => { setEmail(e.target.value); setToken(""); setSent(false); setCode(""); setMessage(""); }} /><button className="inline-btn" type="button" disabled={busy || cooldown.seconds > 0 || !email} onClick={() => void send()}>{cooldown.seconds ? `${cooldown.seconds}초 후 재전송` : "인증번호 요청"}</button></div></div>
      <div className="field"><label htmlFor="reset-code">인증번호</label><div className="input-wrap"><input id="reset-code" inputMode="numeric" maxLength={6} disabled={!sent || Boolean(token) || busy} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /><button className="inline-btn" type="button" disabled={!sent || Boolean(token) || busy} onClick={() => void verify()}>인증 확인</button></div></div>
      {token && <><div className="field"><label htmlFor="reset-password">새 비밀번호</label><div className="input-wrap"><input id="reset-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></div></div><div className="field"><label htmlFor="reset-confirm">새 비밀번호 확인</label><div className="input-wrap"><input id="reset-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></div></div><button className="btn full-width" disabled={busy}>비밀번호 재설정</button></>}
      {message && <p role="status" className="hint">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}<Link to="/login" className="back-link">로그인으로 돌아가기</Link>
    </>}
  </form>;
}
