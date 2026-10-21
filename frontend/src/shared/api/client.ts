// FastAPI 응답을 화면에서 다루기 쉬운 오류 객체로 바꿔 주는 fetch 래퍼

export interface ApiErrorExtra {
  retryAfter?: number;
  remainingAttempts?: number;
  /** 422 검증 오류를 필드명 → 메시지로 정리한 것 */
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: ApiErrorExtra = {},
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "NETWORK", NETWORK_MESSAGE);
  }

  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const detail = data?.detail;
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

export const post = <T>(path: string, body: unknown) => request<T>(path, "POST", body);
