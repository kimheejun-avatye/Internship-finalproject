import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "../features/auth/AuthProvider";
import { setCsrfToken } from "../shared/api/session-client";
const session = { user: { user_id: "u1", email: "member@example.com", name: "회원", team: "AVATYE", role: "MEMBER" }, csrf_token: "csrf", idle_expires_at: new Date(Date.now()+1800000).toISOString(), absolute_expires_at: new Date(Date.now()+28800000).toISOString() };
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
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(session),{status:200})));
  render(<MemoryRouter initialEntries={["/login"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("heading",{name:"회의실 예약"})).toBeInTheDocument();
});

it("sends a successful login to reservations even with an earlier profile destination", async () => {
  vi.stubGlobal("fetch",vi.fn(async(path: string)=>path.endsWith("/login") ? new Response(JSON.stringify(session),{status:200}) : new Response(JSON.stringify({detail:{code:"SESSION_REQUIRED"}}),{status:401})));
  render(<MemoryRouter initialEntries={[{pathname:"/login",state:{from:"/profile"}}]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  const user=userEvent.setup();
  await user.type(await screen.findByLabelText("아이디"),"member@example.com");
  await user.type(screen.getByLabelText("비밀번호"),"Example123!");
  await user.click(screen.getByRole("button",{name:"로그인"}));
  expect(await screen.findByRole("heading",{name:"회의실 예약"})).toBeInTheDocument();
});

it("requires login for direct calendar entry", async () => {
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({detail:{code:"SESSION_REQUIRED"}}),{status:401})));
  render(<MemoryRouter initialEntries={["/calendar"]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("button",{name:"로그인"})).toBeInTheDocument();
  expect(screen.queryByRole("heading",{name:"예약 캘린더"})).not.toBeInTheDocument();
});
