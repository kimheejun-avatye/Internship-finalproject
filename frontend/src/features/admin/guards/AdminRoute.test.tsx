import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import App from "../../../app/routes";
import { setCsrfToken } from "../../../shared/api/session-client";
import { AuthenticatedProviders as AuthProvider } from "../../../app/providers";

const sessionOf = (role: "ADMIN" | "MEMBER") => ({
  user: { user_id: "u1", email: "user@example.com", name: "사용자", team: "AVATYE", role },
  csrf_token: "csrf",
  idle_expires_at: new Date(Date.now() + 1800000).toISOString(),
  absolute_expires_at: new Date(Date.now() + 28800000).toISOString(),
});

/** /api/auth/me 는 세션을, 관리자 목록 API 는 빈 목록을 돌려준다 */
function mockApi(role: "ADMIN" | "MEMBER") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      new Response(JSON.stringify(path.startsWith("/api/admin/") ? [] : sessionOf(role)), { status: 200 }),
    ),
  );
}

function renderAt(path: string) {
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken("");
});

it("관리자에게는 관리자 메뉴와 화면을 보여 준다", async () => {
  mockApi("ADMIN");
  renderAt("/admin");

  expect(await screen.findByRole("heading", { name: "워크스페이스 관리" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "관리자" })).toHaveAttribute("href", "/admin");
});

it("일반 회원에게는 관리자 메뉴를 숨기고 /admin 에서 예약 화면으로 보낸다", async () => {
  mockApi("MEMBER");
  renderAt("/admin");

  expect(await screen.findByRole("heading", { name: "회의실 예약" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "관리자" })).not.toBeInTheDocument();
});
