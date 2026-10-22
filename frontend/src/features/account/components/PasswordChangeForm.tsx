import { FormEvent, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { changePassword } from "../account.api";
import { validatePassword } from "../../auth/validation";
export default function PasswordChangeForm() {
  const { clear } = useAuth();
  const [current, setCurrent] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); if (busy) return; setError(""); const problem = validatePassword(password); if (problem) return setError(problem); if (password !== confirm) return setError("새 비밀번호가 일치하지 않습니다."); setBusy(true); try { await changePassword(current, password); clear("비밀번호를 변경했습니다. 다시 로그인해주세요."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <form className="profile-card card" onSubmit={submit}><h2>비밀번호 변경</h2><p className="notice">변경하면 모든 기기의 로그인이 종료됩니다.</p>
    <div className="field"><label htmlFor="current-password">현재 비밀번호</label><div className="input-wrap"><input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} /></div></div>
    <div className="field"><label htmlFor="new-password">새 비밀번호</label><div className="input-wrap"><input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></div><p className="hint">8~64자, 영문·숫자·특수문자 포함, 공백 금지</p></div>
    <div className="field"><label htmlFor="confirm-password">새 비밀번호 확인</label><div className="input-wrap"><input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="btn full-width" disabled={busy}>{busy ? "변경 중…" : "비밀번호 변경"}</button>
  </form>;
}
