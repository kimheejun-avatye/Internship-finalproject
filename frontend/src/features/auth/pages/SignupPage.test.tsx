import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SignupPage from "./SignupPage";

type Handler = (body: Record<string, unknown>) => { status?: number; body: unknown };

/** 경로별로 응답을 돌려주는 가짜 fetch. 호출 기록은 calls 에 쌓인다 */
function mockApi(handlers: Record<string, Handler>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ path, body });
      const res = handlers[path](body);
      return new Response(JSON.stringify(res.body), { status: res.status ?? 200 });
    }),
  );
  return calls;
}

const BASE = "/api/auth/signup";
const ok = (body: unknown): Handler => () => ({ body });
const fail = (status: number, detail: unknown): Handler => () => ({ status, body: { detail } });

function setup() {
  const user = userEvent.setup();
  render(<MemoryRouter><SignupPage /></MemoryRouter>);
  return user;
}

async function fillProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("이름"), " 김철수 ");
  await user.type(screen.getByLabelText("생일"), "1995-03-02");
  await user.type(screen.getByLabelText("휴대폰번호"), "010-1234-5678");
  await user.type(screen.getByLabelText("비밀번호", { selector: "#password" }), "Passw0rd!x");
  await user.type(screen.getByLabelText("비밀번호 확인"), "Passw0rd!x");
  await user.click(screen.getByLabelText(/개인정보 수집·이용 동의/));
}

async function verifyEmail(user: ReturnType<typeof userEvent.setup>, email = " Kim@Example.com ") {
  await user.type(screen.getByLabelText("아이디"), email);
  await user.click(screen.getByRole("button", { name: "인증번호 요청" }));
  await screen.findByText(/인증번호를 보냈습니다/);
  await user.type(screen.getByLabelText("이메일 인증"), "123456");
  await user.click(screen.getByRole("button", { name: "인증 확인" }));
  await screen.findByText("이메일 인증이 완료되었습니다.");
}

describe("SignupPage", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it("이메일 인증부터 가입 요청까지 API 를 순서대로 호출한다", async () => {
    const calls = mockApi({
      [`${BASE}/check-email`]: ok({ status: "AVAILABLE" }),
      [`${BASE}/send-code`]: ok({ cooldown_seconds: 60, expires_in: 300 }),
      [`${BASE}/verify-code`]: ok({ signup_token: "tok", expires_in: 900 }),
      [BASE]: ok({ user_id: "u1", status: "PENDING" }),
    });
    const user = setup();
    await fillProfile(user);
    await verifyEmail(user);
    await user.click(screen.getByRole("button", { name: "회원가입" }));

    expect(await screen.findByText("가입 요청이 완료되었습니다")).toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual([`${BASE}/check-email`, `${BASE}/send-code`, `${BASE}/verify-code`, BASE]);
    // 이메일은 정규화해서, 휴대폰번호는 숫자만, 토큰은 인증 응답 그대로 보낸다
    expect(calls[3].body).toEqual({
      email: "kim@example.com",
      signup_token: "tok",
      password: "Passw0rd!x",
      name: "김철수",
      birth_date: "1995-03-02",
      phone: "01012345678",
      team: "AVATYE",
    });
  });

  it("이미 가입한 이메일이면 인증번호를 보내지 않고 안내한다", async () => {
    const calls = mockApi({ [`${BASE}/check-email`]: ok({ status: "REGISTERED" }) });
    const user = setup();
    await user.type(screen.getByLabelText("아이디"), "kim@example.com");
    await user.click(screen.getByRole("button", { name: "인증번호 요청" }));

    expect(await screen.findByText("이미 가입한 회원입니다.")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("승인 대기 중인 이메일이면 대기 안내를 보여 준다", async () => {
    mockApi({ [`${BASE}/check-email`]: ok({ status: "PENDING" }) });
    const user = setup();
    await user.type(screen.getByLabelText("아이디"), "kim@example.com");
    await user.click(screen.getByRole("button", { name: "인증번호 요청" }));

    expect(await screen.findByText(/승인 대기 중인 이메일/)).toBeInTheDocument();
  });

  it("인증번호가 틀리면 남은 시도 횟수를 알려 준다", async () => {
    mockApi({
      [`${BASE}/check-email`]: ok({ status: "AVAILABLE" }),
      [`${BASE}/send-code`]: ok({ cooldown_seconds: 60, expires_in: 300 }),
      [`${BASE}/verify-code`]: fail(400, { code: "CODE_MISMATCH", message: "인증번호가 올바르지 않습니다.", remaining_attempts: 4 }),
    });
    const user = setup();
    await user.type(screen.getByLabelText("아이디"), "kim@example.com");
    await user.click(screen.getByRole("button", { name: "인증번호 요청" }));
    await screen.findByText(/인증번호를 보냈습니다/);
    await user.type(screen.getByLabelText("이메일 인증"), "000000");
    await user.click(screen.getByRole("button", { name: "인증 확인" }));

    expect(await screen.findByText("인증번호가 올바르지 않습니다. (남은 시도 4회)")).toBeInTheDocument();
  });

  it("잠금 응답이면 기다려야 하는 시간을 보여 준다", async () => {
    mockApi({
      [`${BASE}/check-email`]: ok({ status: "AVAILABLE" }),
      [`${BASE}/send-code`]: fail(429, { code: "RATE_LIMIT_EMAIL", message: "요청이 너무 많습니다.", retry_after: 1800 }),
    });
    const user = setup();
    await user.type(screen.getByLabelText("아이디"), "kim@example.com");
    await user.click(screen.getByRole("button", { name: "인증번호 요청" }));

    expect(await screen.findByText("요청이 너무 많습니다. 30분 후 다시 시도해 주세요.")).toBeInTheDocument();
  });

  it("인증번호 요청 후에는 재전송 대기 시간이 표시되고 버튼이 잠긴다", async () => {
    mockApi({
      [`${BASE}/check-email`]: ok({ status: "AVAILABLE" }),
      [`${BASE}/send-code`]: ok({ cooldown_seconds: 60, expires_in: 300 }),
    });
    const user = setup();
    await user.type(screen.getByLabelText("아이디"), "kim@example.com");
    await user.click(screen.getByRole("button", { name: "인증번호 요청" }));

    const button = await screen.findByRole("button", { name: /재전송 \(\d+\)/ });
    expect(button).toBeDisabled();
  });

  it("인증 후 이메일을 바꾸면 인증이 풀리고 가입할 수 없다", async () => {
    const calls = mockApi({
      [`${BASE}/check-email`]: ok({ status: "AVAILABLE" }),
      [`${BASE}/send-code`]: ok({ cooldown_seconds: 60, expires_in: 300 }),
      [`${BASE}/verify-code`]: ok({ signup_token: "tok", expires_in: 900 }),
    });
    const user = setup();
    await fillProfile(user);
    await verifyEmail(user, "kim@example.com");
    await user.type(screen.getByLabelText("아이디"), "x");
    expect(screen.queryByText("이메일 인증이 완료되었습니다.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "회원가입" }));
    expect(await screen.findByText("이메일 인증을 완료해 주세요.")).toBeInTheDocument();
    expect(calls.some((c) => c.path === BASE)).toBe(false);
  });

  it("비밀번호 규칙과 확인값 불일치는 서버 호출 없이 막는다", async () => {
    const calls = mockApi({});
    const user = setup();
    await user.type(screen.getByLabelText("비밀번호", { selector: "#password" }), "password");
    await user.type(screen.getByLabelText("비밀번호 확인"), "different");
    await user.click(screen.getByRole("button", { name: "회원가입" }));

    expect(await screen.findByText("비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.")).toBeInTheDocument();
    expect(screen.getByText("비밀번호가 일치하지 않습니다.")).toBeInTheDocument();
    expect(screen.getByText("개인정보 수집·이용에 동의해 주세요.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("가입 토큰이 만료되면 인증을 다시 받도록 안내한다", async () => {
    mockApi({
      [`${BASE}/check-email`]: ok({ status: "AVAILABLE" }),
      [`${BASE}/send-code`]: ok({ cooldown_seconds: 60, expires_in: 300 }),
      [`${BASE}/verify-code`]: ok({ signup_token: "tok", expires_in: 900 }),
      [BASE]: fail(400, { code: "INVALID_TOKEN", message: "이메일 인증이 필요합니다." }),
    });
    const user = setup();
    await fillProfile(user);
    await verifyEmail(user, "kim@example.com");
    await user.click(screen.getByRole("button", { name: "회원가입" }));

    expect(await screen.findByText("인증 시간이 지났습니다. 인증번호를 다시 받아 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("이메일 인증이 완료되었습니다.")).not.toBeInTheDocument();
  });

  it("회사 네트워크 밖이면 서버 메시지를 그대로 보여 준다", async () => {
    mockApi({ [`${BASE}/check-email`]: fail(403, { code: "NOT_COMPANY_NETWORK", message: "회사 네트워크에서만 가입할 수 있습니다." }) });
    const user = setup();
    await user.type(screen.getByLabelText("아이디"), "kim@example.com");
    await user.click(screen.getByRole("button", { name: "인증번호 요청" }));

    expect(await screen.findByText("회사 네트워크에서만 가입할 수 있습니다.")).toBeInTheDocument();
  });

  it("서버에 연결할 수 없으면 안내 문구를 보여 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed"); }));
    const user = setup();
    await user.type(screen.getByLabelText("아이디"), "kim@example.com");
    await user.click(screen.getByRole("button", { name: "인증번호 요청" }));

    await waitFor(() => expect(screen.getByText(/서버에 연결할 수 없습니다/)).toBeInTheDocument());
  });

  it("개인정보 동의 '보기'를 누르면 수집 항목 안내가 열린다", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "보기" }));

    expect(screen.getByRole("dialog", { name: "개인정보 수집·이용 동의" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "확인" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
