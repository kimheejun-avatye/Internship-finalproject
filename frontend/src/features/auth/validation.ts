// 기존 항목은 서버(backend/app/schemas/auth.py)와 같은 규칙으로 빠르게 안내한다.

export const normalizeEmail = (v: string) => v.trim().toLowerCase();

export function validateEmail(v: string): string {
  const email = normalizeEmail(v);
  if (!email) return "이메일을 입력해 주세요.";
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "이메일 형식이 올바르지 않습니다.";
  return "";
}

export function validatePassword(v: string): string {
  if (v.length < 8 || v.length > 64) return "비밀번호는 8~64자여야 합니다.";
  if (/\s/.test(v)) return "비밀번호에 공백을 사용할 수 없습니다.";
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v) || !/[^A-Za-z0-9]/.test(v)) {
    return "비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.";
  }
  return "";
}

export function validateName(v: string): string {
  const name = v.trim();
  return name.length >= 1 && name.length <= 50 ? "" : "이름은 1~50자로 입력해 주세요.";
}

// 부서 / 직무의 필수 입력은 화면 요구사항이다. 서버 계약의 길이 제한은 확인 후 반영한다.
export function validatePosition(v: string): string {
  return v.trim() ? "" : "부서 / 직무를 입력해 주세요.";
}

export const normalizePhone = (v: string) => v.replace(/[-\s]/g, "");

export function validatePhone(v: string): string {
  return /^01[016789][0-9]{7,8}$/.test(normalizePhone(v)) ? "" : "휴대폰번호 형식이 올바르지 않습니다.";
}

export function validateBirthDate(v: string): string {
  if (!v) return "생일을 입력해 주세요.";
  const today = new Date().toISOString().slice(0, 10);
  return v >= "1900-01-01" && v <= today ? "" : "생일이 올바르지 않습니다.";
}

/** 초 → "3분" / "40초" */
export function formatWait(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)}분` : `${seconds}초`;
}
