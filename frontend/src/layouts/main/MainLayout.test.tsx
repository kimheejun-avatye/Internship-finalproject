import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import App from "../../app/App";
import { AuthProvider } from "../../features/auth/AuthProvider";
import { setCsrfToken } from "../../shared/api/session-client";

const session = {
  user: { user_id: "u1", email: "member@example.com", name: "김회원", team: "AVATYE", role: "MEMBER" },
  csrf_token: "csrf",
  idle_expires_at: new Date(Date.now() + 1800000).toISOString(),
  absolute_expires_at: new Date(Date.now() + 28800000).toISOString(),
};

function pageResponse(path: string) {
  if (path.startsWith("/api/users/search?")) return new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 });
  if (path.startsWith("/api/chat/rooms?")) return new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 });
  if (path === "/api/auth/me") return new Response(JSON.stringify(session), { status: 200 });
  if (path === "/api/calendar/rooms" || path.startsWith("/api/calendar/reservations?") || path === "/api/rooms") {
    return new Response(JSON.stringify([]), { status: 200 });
  }
  if (/^\/api\/rooms\/[^/]+\/availability\?/.test(path)) return new Response(JSON.stringify([]), { status: 200 });
  throw new Error(`Unexpected API request in layout test: ${path}`);
}

function renderMain() {
  return render(<MemoryRouter initialEntries={["/calendar"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(""); });

it("keeps account navigation and the chat layout beside the current page", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => pageResponse(path)));
  renderMain();

  const header = (await screen.findByRole("link", { name: "캘린더 홈" })).closest("header")!;
  expect(within(header).getByText("김회원")).toBeInTheDocument();
  expect(within(header).getByRole("link", { name: "계정" })).toHaveAttribute("href", "/profile");
  expect(within(header).getByRole("button", { name: "알림 (준비 중)" })).toBeDisabled();
  expect(within(header).queryByRole("link", { name: "관리자" })).not.toBeInTheDocument();
  const chat = screen.getByRole("complementary", { name: "채팅 영역" });
  expect(within(chat).getByRole("heading", { name: "AVATYE 메신저" })).toBeInTheDocument();
  expect(within(chat).getByRole("tab", { name: "친구" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByRole("complementary")).toEqual([chat]);
  expect(within(screen.getByRole("main")).getByRole("heading", { name: "예약 캘린더" })).toBeInTheDocument();

  const user = userEvent.setup();
  const roomsTab = within(chat).getByRole("tab", { name: "채팅 목록" });
  await user.click(roomsTab);
  expect(within(chat).getByRole("tabpanel", { name: "채팅 목록" })).toBeVisible();
  await user.keyboard("{ArrowLeft}");
  expect(within(chat).getByRole("tab", { name: "친구" })).toHaveFocus();
  expect(within(chat).getByRole("tabpanel", { name: "친구" })).toBeVisible();
  expect(within(chat).getByRole("button", { name: "새 채팅" })).toBeEnabled();
  await user.click(within(screen.getByRole("main")).getByRole("link", { name: "+ 회의실 예약" }));
  expect(screen.getByRole("heading", { name: "회의실 예약" })).toBeInTheDocument();
  await user.click(within(header).getByRole("link", { name: "캘린더 홈" }));
  expect(screen.getByRole("heading", { name: "예약 캘린더" })).toBeInTheDocument();
  await user.click(within(header).getByRole("link", { name: "계정" }));
  expect(screen.getByRole("heading", { name: "비밀번호 변경" })).toBeInTheDocument();
  expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "채팅 영역" })).not.toBeInTheDocument();
});

it("prevents duplicate logout requests and keeps a failed logout retryable", async () => {
  let finishLogout!: (response: Response) => void;
  const pendingLogout = new Promise<Response>((resolve) => { finishLogout = resolve; });
  const fetch = vi.fn(async (path: string) => path.endsWith("/logout")
    ? pendingLogout
    : pageResponse(path));
  vi.stubGlobal("fetch", fetch);
  renderMain();

  const user = userEvent.setup();
  await user.dblClick(await screen.findByRole("button", { name: "로그아웃" }));
  expect(screen.getByRole("button", { name: "로그아웃 중…" })).toBeDisabled();
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("/logout"))).toHaveLength(1);

  await act(async () => finishLogout(new Response(JSON.stringify({ detail: { code: "UNAVAILABLE", message: "잠시 후 다시 시도해 주세요." } }), { status: 503 })));
  expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요.");
  expect(screen.getByRole("link", { name: "계정" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeEnabled();

  fetch.mockImplementation(async (path: string) => path.endsWith("/logout")
    ? new Response(null, { status: 204 })
    : pageResponse(path));
  await user.click(screen.getByRole("button", { name: "로그아웃" }));
  expect(await screen.findByRole("button", { name: "로그인" })).toBeInTheDocument();
});
