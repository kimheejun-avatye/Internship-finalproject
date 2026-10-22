import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PasswordResetPage from "./PasswordResetPage";
import { setCsrfToken } from "../../../shared/api/session-client";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(""); });

async function verify() {
  const user = userEvent.setup();
  render(<MemoryRouter><PasswordResetPage /></MemoryRouter>);
  await user.type(screen.getByLabelText("이메일"), "MEMBER@EXAMPLE.COM");
  await user.click(screen.getByRole("button", { name: "인증번호 요청" }));
  await user.type(screen.getByLabelText("인증번호"), "123456");
  await user.click(screen.getByRole("button", { name: "인증 확인" }));
  await user.type(await screen.findByLabelText("새 비밀번호", { exact: true }), "Changed123!");
  await user.type(screen.getByLabelText("새 비밀번호 확인"), "Changed123!");
  return user;
}

it("sends email proof and the returned reset token before replacing the password", async () => {
  const fetch = vi.fn(async (path: string) => {
    if (path.endsWith("send-code")) return json({ message: "인증번호를 발송했습니다.", cooldown_seconds: 60, expires_in: 300 });
    if (path.endsWith("verify-code")) return json({ reset_token: "one-use-proof", expires_in: 900 });
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetch);
  const user = await verify();
  await user.click(screen.getByRole("button", { name: "비밀번호 재설정" }));
  expect(await screen.findByText("비밀번호를 재설정하고 모든 로그인을 종료했습니다.")).toBeInTheDocument();
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(JSON.parse(calls[0][1].body as string)).toEqual({ email: "member@example.com" });
  expect(JSON.parse(calls[2][1].body as string)).toEqual({ reset_token: "one-use-proof", new_password: "Changed123!" });
  expect(calls[2][1].credentials).toBe("same-origin");
});

it("requires verification again if the server rejects an expired reset token", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path.endsWith("send-code")) return json({ message: "발송", cooldown_seconds: 0, expires_in: 300 });
    if (path.endsWith("verify-code")) return json({ reset_token: "expired-proof", expires_in: 900 });
    return json({ detail: { code: "INVALID_RESET_TOKEN", message: "인증이 만료되었습니다." } }, 400);
  }));
  const user = await verify();
  await user.click(screen.getByRole("button", { name: "비밀번호 재설정" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("인증이 만료되었습니다.");
  expect(screen.queryByLabelText("새 비밀번호", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "인증 확인" })).toBeDisabled();
});
