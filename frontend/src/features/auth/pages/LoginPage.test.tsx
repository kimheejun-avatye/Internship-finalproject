import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../AuthProvider";
import ProtectedRoute from "../guards/ProtectedRoute";
import LoginPage from "./LoginPage";
import { request, setCsrfToken } from "../../../shared/api/session-client";
import PasswordChangeForm from "../../account/components/PasswordChangeForm";

const session = { user: { user_id: "u1", email: "member@example.com", name: "회원", team: "AVATYE", role: "MEMBER" }, csrf_token: "csrf-value", idle_expires_at: new Date(Date.now()+1800000).toISOString(), absolute_expires_at: new Date(Date.now()+28800000).toISOString() };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status });
function setup(path="/login") {
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes><Route path="/login" element={<LoginPage />} /><Route element={<ProtectedRoute />}><Route path="/reservations" element={<h1>보호된 예약하기</h1>} /><Route path="/profile" element={<><h1>보호된 프로필</h1><PasswordChangeForm /></>} /></Route></Routes></AuthProvider></MemoryRouter>);
  return userEvent.setup();
}
afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(""); });

describe("session login integration", () => {
  it("normalizes login input and enters protected reservations", async () => {
    const fetch=vi.fn(async(path: string) => path.endsWith("/login") ? json(session) : json({detail:{code:"SESSION_REQUIRED"}},401));
    vi.stubGlobal("fetch",fetch); const user=setup();
    await user.type(screen.getByLabelText("아이디"),"MEMBER@EXAMPLE.COM"); await user.type(screen.getByLabelText("비밀번호"),"Example123!"); await user.click(screen.getByRole("button",{name:"로그인"}));
    expect(await screen.findByText("보호된 예약하기")).toBeInTheDocument();
    const call=fetch.mock.calls.find(([path])=>path==="/api/auth/login");
    expect(call).toBeTruthy();
    const init=(fetch.mock.calls as unknown as [string,RequestInit][]).find(([path])=>path==="/api/auth/login")![1];
    expect(JSON.parse(String(init.body))).toEqual({email:"member@example.com",password:"Example123!"});
    expect(init.credentials).toBe("same-origin");
  });
  it("shows lock retry guidance without redirecting", async () => {
    vi.stubGlobal("fetch",vi.fn(async(path: string)=>path.endsWith("/login") ? json({detail:{code:"LOGIN_RATE_LIMITED",message:"제한되었습니다.",retry_after:300}},429) : json({detail:{}},401)));
    const user=setup(); await user.type(screen.getByLabelText("아이디"),"member@example.com"); await user.type(screen.getByLabelText("비밀번호"),"wrong"); await user.click(screen.getByRole("button",{name:"로그인"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("5분 후");
    expect(screen.queryByText("보호된 프로필")).not.toBeInTheDocument();
  });
  it("restores a session when opening a protected route", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>json(session))); setup("/profile");
    expect(await screen.findByText("보호된 프로필")).toBeInTheDocument();
  });
  it("redirects an unauthenticated protected route to login", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>json({detail:{code:"SESSION_REQUIRED"}},401))); setup("/profile");
    expect(await screen.findByRole("button",{name:"로그인"})).toBeInTheDocument();
  });
  it("keeps a server outage distinct from an unauthenticated session", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>json({detail:{message:"서버 연결 실패"}},503))); setup("/profile");
    expect(await screen.findByRole("alert")).toHaveTextContent("서버 연결 실패");
    expect(screen.queryByRole("button",{name:"로그인"})).not.toBeInTheDocument();
  });
  it("clears auth after password change and sends csrf", async () => {
    const fetch=vi.fn(async(path: string)=> path.endsWith("/change") ? new Response(null,{status:204}) : json(session));
    vi.stubGlobal("fetch",fetch); const user=setup("/profile");
    await user.type(await screen.findByLabelText("현재 비밀번호"),"Example123!");
    await user.type(screen.getByLabelText("새 비밀번호",{exact:true}),"Changed123!");
    await user.type(screen.getByLabelText("새 비밀번호 확인"),"Changed123!");
    await user.click(screen.getByRole("button",{name:"비밀번호 변경"}));
    expect(await screen.findByRole("button",{name:"로그인"})).toBeInTheDocument();
    const init=(fetch.mock.calls as unknown as [string,RequestInit][]).find(([path])=>path.endsWith("/change"))![1];
    expect((init.headers as Record<string,string>)["X-CSRF-Token"]).toBe("csrf-value");
  });
  it("handles an empty 204 response", async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:204})));
    await expect(request("/api/auth/logout","POST",{})).resolves.toBeNull();
  });
});
