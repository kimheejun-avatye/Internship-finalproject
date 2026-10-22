import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "../features/auth/AuthProvider";
import { setCsrfToken } from "../shared/api/session-client";
const session = { user: { user_id: "u1", email: "member@example.com", name: "회원", team: "AVATYE", role: "MEMBER" }, csrf_token: "csrf", idle_expires_at: new Date(Date.now()+1800000).toISOString(), absolute_expires_at: new Date(Date.now()+28800000).toISOString() };
const room = { room_id: "0a01e4aa-c032-47f8-8751-1a29b069fa0a", name: "로그인 확인 회의실", status: "ACTIVE", capacity: 6 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function reservationResponse(path: string): Response {
  if (path === "/api/rooms") return json([room]);
  if (path === `/api/rooms/${room.room_id}/reservations?page=1`) {
    return json({ items: [], total: 0, page: 1, page_size: 5 });
  }
  throw new Error(`Unexpected API request in login test: ${path}`);
}
afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(""); });
it("keeps password management and team navigation for the authenticated account", async () => {
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(session),{status:200})));
  render(<MemoryRouter initialEntries={["/profile"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("heading",{level:1,name:"비밀번호 변경"})).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"예약하기"})).toHaveAttribute("href","/reservations");
  expect(screen.getByRole("link",{name:"캘린더"})).toHaveAttribute("href","/calendar");
});
it("logs out through the server and returns to login", async () => {
  const fetch = vi.fn(async(path: string)=>path.endsWith("/logout") ? new Response(null,{status:204}) : new Response(JSON.stringify(session),{status:200}));
  vi.stubGlobal("fetch",fetch);
  render(<MemoryRouter initialEntries={["/profile"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button",{name:"로그아웃"}));
  expect(await screen.findByRole("button",{name:"로그인"})).toBeInTheDocument();
  const call = (fetch.mock.calls as unknown as [string, RequestInit][]).find(([path])=>path.endsWith("/logout"));
  expect(call?.[1].method).toBe("POST");
  expect((call?.[1].headers as Record<string,string>)["X-CSRF-Token"]).toBe("csrf");
});


it("sends an existing session from login to reservations", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) =>
    path === "/api/auth/me" ? json(session) : reservationResponse(path)));
  render(<MemoryRouter initialEntries={["/login"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("heading",{name:"회의실 예약"})).toBeInTheDocument();
  expect(await screen.findByText("이 페이지에 표시할 예약이 없습니다.")).toBeInTheDocument();
});

it("sends a successful login to reservations even with an earlier profile destination", async () => {
  let loggedIn = false;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/auth/login") { loggedIn = true; return json(session); }
    if (path === "/api/auth/me") return loggedIn ? json(session) : json({ detail: { code: "SESSION_REQUIRED" } }, 401);
    return reservationResponse(path);
  }));
  render(<MemoryRouter initialEntries={[{pathname:"/login",state:{from:"/profile"}}]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  const user=userEvent.setup();
  await user.type(await screen.findByLabelText("아이디"),"member@example.com");
  await user.type(screen.getByLabelText("비밀번호"),"Example123!");
  await user.click(screen.getByRole("button",{name:"로그인"}));
  expect(await screen.findByRole("heading",{name:"회의실 예약"})).toBeInTheDocument();
  expect(await screen.findByText("이 페이지에 표시할 예약이 없습니다.")).toBeInTheDocument();
});

it("requires login for direct calendar entry", async () => {
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({detail:{code:"SESSION_REQUIRED"}}),{status:401})));
  render(<MemoryRouter initialEntries={["/calendar"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("button",{name:"로그인"})).toBeInTheDocument();
  expect(screen.queryByRole("heading",{name:"예약 캘린더"})).not.toBeInTheDocument();
});


it("keeps the selected room and page while StrictMode restores the session", async () => {
  const checks: ((response: Response) => void)[] = [];
  const fetch = vi.fn((path: string) => {
    if (path === "/api/auth/me") return new Promise<Response>(resolve => checks.push(resolve));
    if (path === "/api/rooms") return Promise.resolve(new Response(JSON.stringify([
      { room_id: "room-a", name: "회의실 A", status: "ACTIVE", capacity: 6 },
      { room_id: "room-b", name: "회의실 B", status: "ACTIVE", capacity: 10 },
    ]), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify({ items: [], page: 2, page_size: 5, total: 6 }), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  render(<StrictMode><MemoryRouter initialEntries={["/reservations?room_id=room-b&page=2"]}><AuthProvider><App /></AuthProvider></MemoryRouter></StrictMode>);
  await act(async () => checks[0](new Response(JSON.stringify(session), { status: 200 })));
  expect(screen.getByRole("status")).toHaveTextContent("로그인 상태를 확인하고 있습니다.");
  expect(screen.queryByRole("button", { name: "로그인" })).not.toBeInTheDocument();
  await act(async () => checks[1](new Response(JSON.stringify(session), { status: 200 })));
  expect(await screen.findByRole("heading", { name: "회의실 B - 오늘의 일정" })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith("/api/rooms/room-b/reservations?page=2", expect.anything());
});


it.each([
  ["USER_BLOCKED", "차단된 계정입니다."],
  ["USER_PENDING", "관리자 승인 대기 중입니다."],
])("finishes session loading after an authentication loss response: %s", async (code, message) => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ detail: { code, message } }, 403)));
  render(<StrictMode><MemoryRouter initialEntries={["/reservations"]}><AuthProvider><App /></AuthProvider></MemoryRouter></StrictMode>);
  expect(await screen.findByRole("button", { name: "로그인" })).toBeInTheDocument();
  expect(screen.queryByText("로그인 상태를 확인하고 있습니다.")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(message);
});
