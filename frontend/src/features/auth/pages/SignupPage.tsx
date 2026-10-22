import { FormEvent, ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import Logo from "../../../shared/ui/Logo";
import { ApiError } from "../../../shared/api/client";
import { checkEmail, sendCode, signup, verifyCode, type Team } from "../signup.api";
import { useCountdown } from "../../../shared/hooks/useCountdown";
import PrivacyDialog from "../components/PrivacyDialog";
import {
  formatWait,
  normalizeEmail,
  normalizePhone,
  validateBirthDate,
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
} from "../validation";

type FieldName = "name" | "birth_date" | "phone" | "email" | "code" | "password" | "password2" | "consent";
type Errors = Partial<Record<FieldName, string>>;

const INITIAL = { name: "", birthDate: "", phone: "", email: "", code: "", password: "", password2: "", team: "AVATYE" as Team };

/** 서버 오류 메시지에 "N분 후 다시 시도" 안내를 붙인다 */
function describe(e: unknown): string {
  if (!(e instanceof ApiError)) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (e.code === "CODE_MISMATCH" && e.extra.remainingAttempts !== undefined) {
    return `${e.message} (남은 시도 ${e.extra.remainingAttempts}회)`;
  }
  if (e.extra.retryAfter && e.code !== "RESEND_COOLDOWN") return `${e.message} ${formatWait(e.extra.retryAfter)} 후 다시 시도해 주세요.`;
  return e.message;
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="field-error" role="alert">{error}</p> : hint}
    </div>
  );
}

export default function SignupPage() {
  const [form, setForm] = useState(INITIAL);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeInfo, setCodeInfo] = useState("");
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | "submit" | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [done, setDone] = useState(false);
  const cooldown = useCountdown();

  const verified = signupToken !== null;
  const setError = (name: FieldName, message: string) => setErrors((prev) => ({ ...prev, [name]: message }));
  const clearError = (name: FieldName) => setErrors((prev) => ({ ...prev, [name]: undefined }));

  function change(name: keyof typeof INITIAL) {
    return (value: string) => {
      setForm((prev) => ({ ...prev, [name]: value, ...(name === "email" ? { code: "" } : {}) }));
      if (name === "email") {
        // 이메일을 바꾸면 이전 주소로 받은 인증은 모두 무효
        setCodeSent(false);
        setCodeInfo("");
        setSignupToken(null);
      }
    };
  }

  async function requestCode() {
    const message = validateEmail(form.email);
    if (message) return setError("email", message);
    const email = normalizeEmail(form.email);
    setBusy("send");
    clearError("email");
    setCodeInfo("");
    try {
      const { status } = await checkEmail(email);
      if (status === "REGISTERED") return setError("email", "이미 가입한 회원입니다.");
      if (status === "PENDING") return setError("email", "승인 대기 중인 이메일입니다. 관리자 승인을 기다려 주세요.");
      const res = await sendCode(email);
      setCodeSent(true);
      cooldown.start(res.cooldown_seconds);
      setCodeInfo(`인증번호를 보냈습니다. ${Math.round(res.expires_in / 60)}분 안에 입력해 주세요.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESEND_COOLDOWN" && e.extra.retryAfter) cooldown.start(e.extra.retryAfter);
      setError("email", describe(e));
    } finally {
      setBusy(null);
    }
  }

  async function confirmCode() {
    if (!/^\d{6}$/.test(form.code)) return setError("code", "인증번호 6자리를 입력해 주세요.");
    setBusy("verify");
    clearError("code");
    try {
      const res = await verifyCode(normalizeEmail(form.email), form.code);
      setSignupToken(res.signup_token);
      setCodeInfo("");
    } catch (e) {
      setError("code", describe(e));
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const found: Errors = {
      name: validateName(form.name) || undefined,
      birth_date: validateBirthDate(form.birthDate) || undefined,
      phone: validatePhone(form.phone) || undefined,
      email: validateEmail(form.email) || undefined,
      password: validatePassword(form.password) || undefined,
      password2: form.password === form.password2 ? undefined : "비밀번호가 일치하지 않습니다.",
      code: verified ? undefined : "이메일 인증을 완료해 주세요.",
      consent: agreed ? undefined : "개인정보 수집·이용에 동의해 주세요.",
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    setBusy("submit");
    try {
      await signup({
        email: normalizeEmail(form.email),
        signup_token: signupToken!,
        password: form.password,
        name: form.name.trim(),
        birth_date: form.birthDate,
        phone: normalizePhone(form.phone),
        team: form.team,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_TOKEN") {
        setSignupToken(null);
        setCodeSent(false);
        setForm((prev) => ({ ...prev, code: "" }));
        setError("code", "인증 시간이 지났습니다. 인증번호를 다시 받아 주세요.");
      } else if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        setError("email", err.message);
      } else if (err instanceof ApiError && err.code === "VALIDATION" && err.extra.fields) {
        const mapped: Errors = {};
        for (const [field, message] of Object.entries(err.extra.fields)) {
          if (field in INITIAL || field === "birth_date") mapped[field as FieldName] = message;
        }
        setErrors(mapped);
        setFormError(err.message);
      } else {
        setFormError(describe(err));
      }
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-box signup done-box">
          <Logo className="auth-logo small" />
          <h1>가입 요청이 완료되었습니다</h1>
          <p>관리자가 승인하면 로그인할 수 있습니다.</p>
          <Link to="/login" className="btn link-btn">로그인으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  const sendLabel = busy === "send" ? "전송 중…" : cooldown.seconds > 0 ? `재전송 (${cooldown.seconds})` : codeSent ? "재전송" : "인증번호 요청";

  return (
    <div className="auth-page">
      <form className="auth-box signup" onSubmit={submit} noValidate>
        <Logo className="auth-logo small" />

        <Field id="name" label="이름" error={errors.name}>
          <div className="input-wrap"><input id="name" placeholder="이름" value={form.name} onChange={(e) => change("name")(e.target.value)} /></div>
        </Field>

        <div className="field-row">
          <Field id="birthDate" label="생일" error={errors.birth_date}>
            <div className="input-wrap"><input id="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={(e) => change("birthDate")(e.target.value)} /></div>
          </Field>
          <Field id="phone" label="휴대폰번호" error={errors.phone}>
            <div className="input-wrap"><input id="phone" inputMode="tel" placeholder="010-1234-5678" value={form.phone} onChange={(e) => change("phone")(e.target.value)} /></div>
          </Field>
        </div>

        <Field id="email" label="아이디" error={errors.email}>
          <div className="input-wrap">
            <input id="email" type="email" placeholder="회사 이메일" autoComplete="username" value={form.email} onChange={(e) => change("email")(e.target.value)} />
            <button type="button" className="inline-btn" disabled={busy !== null || cooldown.seconds > 0} onClick={requestCode}>{sendLabel}</button>
          </div>
        </Field>

        <Field
          id="code"
          label="이메일 인증"
          error={errors.code}
          hint={
            verified ? <p className="hint ok">이메일 인증이 완료되었습니다.</p> : <p className="hint">{codeInfo || "회사 이메일로 받은 인증번호를 입력해 주세요."}</p>
          }
        >
          <div className="input-wrap">
            <input id="code" inputMode="numeric" maxLength={6} placeholder="인증번호 6자리" disabled={!codeSent || verified} value={form.code} onChange={(e) => change("code")(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="inline-btn" disabled={!codeSent || verified || busy !== null} onClick={confirmCode}>
              {verified ? "인증 완료" : busy === "verify" ? "확인 중…" : "인증 확인"}
            </button>
          </div>
        </Field>

        <Field id="password" label="비밀번호" error={errors.password} hint={<p className="hint">8~64자, 영문·숫자·특수문자를 모두 포함하고 공백은 쓸 수 없습니다.</p>}>
          <div className="input-wrap"><input id="password" type="password" placeholder="비밀번호" autoComplete="new-password" value={form.password} onChange={(e) => change("password")(e.target.value)} /></div>
        </Field>

        <Field id="password2" label="비밀번호 확인" error={errors.password2}>
          <div className="input-wrap"><input id="password2" type="password" placeholder="비밀번호 확인" autoComplete="new-password" value={form.password2} onChange={(e) => change("password2")(e.target.value)} /></div>
        </Field>

        <div className="field">
          <span className="field-label">소속</span>
          <div className="team-options" role="radiogroup" aria-label="소속">
            {(["AVATYE", "GURU"] as Team[]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={form.team === t} className={`team-option${form.team === t ? " selected" : ""}`} onClick={() => setForm((prev) => ({ ...prev, team: t }))}>
                <span className="dot" />
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="consent">
          <label>
            <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); clearError("consent"); }} />
            [필수] 개인정보 수집·이용 동의
          </label>
          <button type="button" className="view" onClick={() => setShowPrivacy(true)}>보기</button>
        </div>
        {errors.consent && <p className="field-error" role="alert">{errors.consent}</p>}

        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button type="submit" className="btn" style={{ width: "100%", height: 52 }} disabled={busy === "submit"}>
          {busy === "submit" ? "처리 중…" : "회원가입"}
        </button>
        <Link to="/login" className="back-link">로그인으로 돌아가기</Link>
      </form>
      {showPrivacy && <PrivacyDialog onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
