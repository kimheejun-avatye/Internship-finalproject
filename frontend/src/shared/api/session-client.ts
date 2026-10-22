import { ApiError } from "./client";
export { ApiError } from "./client";

const NETWORK_MESSAGE = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";

let csrfToken = "";
export function setCsrfToken(value: string) { csrfToken = value; }

export async function request<T>(path: string, method = "GET", body?: unknown, activity = false, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      ...(signal ? { signal } : {}),
      headers: { "Content-Type": "application/json", ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), ...(activity ? { "X-Session-Activity": "user" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "NETWORK", NETWORK_MESSAGE);
  }

  const data = await res.json().catch(() => null);
  // An abandoned account's response must not invalidate the current session.
  signal?.throwIfAborted();
  if (res.ok) return data as T;

  const detail = data?.detail;
  if (res.status === 401 && !["/api/auth/login", "/api/auth/me"].includes(path) || res.status === 403 && ["USER_BLOCKED", "USER_PENDING"].includes(detail?.code)) {
    window.dispatchEvent(new CustomEvent("auth:lost", { detail: detail?.message }));
  }
  if (Array.isArray(detail)) {
    // pydantic 검증 오류: [{loc: ["body", "password"], msg: "Value error, ..."}]
    const fields: Record<string, string> = {};
    for (const item of detail) {
      const name = String(item.loc?.[item.loc.length - 1] ?? "");
      if (name && !fields[name]) fields[name] = String(item.msg ?? "").replace(/^Value error, /, "");
    }
    throw new ApiError(res.status, "VALIDATION", "입력한 내용을 확인해 주세요.", { fields });
  }
  if (detail && typeof detail === "object") {
    throw new ApiError(res.status, detail.code ?? "ERROR", detail.message ?? "요청을 처리하지 못했습니다.", {
      retryAfter: detail.retry_after,
      remainingAttempts: detail.remaining_attempts,
    });
  }
  throw new ApiError(res.status, "ERROR", "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export const post = <T>(path: string, body: unknown, activity = false) => request<T>(path, "POST", body, activity);
