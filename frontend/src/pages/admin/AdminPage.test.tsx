import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRoom, AdminUser } from "../../shared/api/admin";
import AdminPage from "./AdminPage";

type Reply = { status?: number; body?: unknown };

/** "METHOD 경로" 별로 응답을 돌려주는 가짜 fetch. 호출 기록은 calls 에 쌓인다 */
function mockApi(handlers: Record<string, () => Reply>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      const key = `${init.method} ${path}`;
      calls.push(key);
      const reply = handlers[key]();
      return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }),
  );
  return calls;
}

const user = (overrides: Partial<AdminUser>): AdminUser => ({
  user_id: "u1",
  email: "member@example.com",
  name: "김멤버",
  team: "AVATYE",
  role: "MEMBER",
  status: "ACTIVE",
  created_at: "2026-10-18T00:00:00Z",
  approved_at: "2026-10-18T00:00:00Z",
  blocked_at: null,
  ...overrides,
});

const room = (overrides: Partial<AdminRoom>): AdminRoom => ({
  room_id: "r1",
  name: "A회의실",
  status: "ACTIVE",
  capacity: 6,
  blocked_until: null,
  ...overrides,
});

const USERS = [
  user({ user_id: "admin", name: "김관리", email: "admin@example.com", role: "ADMIN" }),
  user({ user_id: "pending", name: "최대기", email: "pending@example.com", status: "PENDING", approved_at: null }),
  user({ user_id: "member", name: "이멤버", email: "member@example.com" }),
];
const ROOMS = [room({ room_id: "a", name: "A회의실" }), room({ room_id: "b", name: "B회의실", capacity: 10 })];

const ok = (body: unknown) => () => ({ body });
const listed = { "GET /api/admin/users": ok(USERS), "GET /api/admin/rooms": ok(ROOMS) };

const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

describe("AdminPage", () => {
  beforeEach(() => vi.spyOn(window, "confirm").mockReturnValue(true));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("회원 상태에 맞는 버튼과 통계를 보여 준다", async () => {
    mockApi(listed);
    render(<AdminPage />);

    await screen.findByText("최대기");
    expect(within(rowOf("최대기")).getByRole("button", { name: "승인" })).toBeInTheDocument();
    expect(within(rowOf("최대기")).getByRole("button", { name: "거절" })).toBeInTheDocument();
    expect(within(rowOf("이멤버")).getByRole("button", { name: "차단" })).toBeInTheDocument();
    // 관리자는 차단할 수 없다
    expect(within(rowOf("김관리")).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("승인 대기 1명")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("가입을 승인하면 승인됨으로 바뀐다", async () => {
    const calls = mockApi({
      ...listed,
      "POST /api/admin/users/pending/approve": ok({ ...USERS[1], status: "ACTIVE", approved_at: "2026-10-19T00:00:00Z" }),
    });
    render(<AdminPage />);
    await screen.findByText("최대기");

    await userEvent.click(within(rowOf("최대기")).getByRole("button", { name: "승인" }));

    expect(await within(rowOf("최대기")).findByText("승인됨")).toBeInTheDocument();
    expect(calls).toContain("POST /api/admin/users/pending/approve");
  });

  it("가입을 거절하면 목록에서 사라진다", async () => {
    mockApi({ ...listed, "POST /api/admin/users/pending/reject": () => ({ status: 204 }) });
    render(<AdminPage />);
    await screen.findByText("최대기");

    await userEvent.click(within(rowOf("최대기")).getByRole("button", { name: "거절" }));

    expect(await screen.findByText("승인 대기 0명")).toBeInTheDocument();
    expect(screen.queryByText("최대기")).not.toBeInTheDocument();
  });

  it("확인을 취소하면 차단하지 않는다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const calls = mockApi(listed);
    render(<AdminPage />);
    await screen.findByText("이멤버");

    await userEvent.click(within(rowOf("이멤버")).getByRole("button", { name: "차단" }));

    expect(calls.filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("회원을 차단하면 차단됨으로 바뀌고 버튼이 사라진다", async () => {
    mockApi({
      ...listed,
      "POST /api/admin/users/member/block": ok({ ...USERS[2], status: "BLOCKED", blocked_at: "2026-10-19T00:00:00Z" }),
    });
    render(<AdminPage />);
    await screen.findByText("이멤버");

    await userEvent.click(within(rowOf("이멤버")).getByRole("button", { name: "차단" }));

    expect(await within(rowOf("이멤버")).findByText("차단됨")).toBeInTheDocument();
    expect(within(rowOf("이멤버")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("회의실을 차단하면 끝나는 시각을 보여 준다", async () => {
    const until = "2026-10-19T07:00:00Z";
    mockApi({ ...listed, "POST /api/admin/rooms/a/block": ok({ ...ROOMS[0], blocked_until: until }) });
    render(<AdminPage />);
    await screen.findByText("A회의실");

    await userEvent.click(within(rowOf("A회의실")).getByRole("button", { name: "차단" }));

    const time = new Date(until).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
    expect(await screen.findByText(`차단 중 · ${time}까지`)).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("처리에 실패하면 오류를 보여 주고 목록을 다시 받는다", async () => {
    const calls = mockApi({
      ...listed,
      "POST /api/admin/rooms/a/block": () => ({
        status: 409,
        body: { detail: { code: "ROOM_ALREADY_BLOCKED", message: "이미 차단 중인 회의실입니다." } },
      }),
    });
    render(<AdminPage />);
    await screen.findByText("A회의실");

    await userEvent.click(within(rowOf("A회의실")).getByRole("button", { name: "차단" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 차단 중인 회의실입니다.");
    expect(calls.filter((c) => c === "GET /api/admin/rooms")).toHaveLength(2);
  });

  it("권한이 없으면 서버 안내 문구를 보여 준다", async () => {
    const forbidden = () => ({
      status: 403,
      body: { detail: { code: "ADMIN_REQUIRED", message: "관리자만 사용할 수 있습니다." } },
    });
    mockApi({ "GET /api/admin/users": forbidden, "GET /api/admin/rooms": forbidden });
    render(<AdminPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("관리자만 사용할 수 있습니다.");
  });
});
