import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import MeetingNotePage from "./MeetingNotePage";

const meeting = {
  reservation_id: "r1", title: "프로덕트 주간 회의", room_id: "a", room_name: "회의실 A", organizer_id: "u1",
  start_at: "2026-10-22T14:00:00+09:00", end_at: "2026-10-22T15:00:00+09:00",
  participant_count: 3, is_mine: true, is_attending: true,
};
const path = "/reservations/r1/memo?date=2026-10-22&calendar_date=2026-10-21&view=month&scope=mine&room_id=a";
const note = { memo_id: "m1", reservation_id: "r1", user_id: "u1", memo: "저장할 내용", created_at: "2026-10-22T14:10:00+09:00", updated_at: "2026-10-22T14:20:00+09:00" };
function mount() {
  const router = createMemoryRouter([
    { path: "/reservations/:reservationId/memo", element: <MeetingNotePage /> },
    { path: "/calendar", element: <h1>달력 복귀</h1> },
  ], { initialEntries: ["/calendar", path] });
  render(<RouterProvider router={router} />);
  return router;
}
function api(initial: unknown = null) {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => new Response(JSON.stringify(
    url.startsWith("/api/calendar/") ? [meeting] : options?.method === "PUT" ? note : initial,
  ), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("reloads meeting information from the URL, leaves null memo unsaved, and sends only memo on first save", async () => {
  const fetch = api();
  const router = mount();
  expect(await screen.findByRole("textbox", { name: "내 회의록" })).toHaveValue("");
  expect(screen.getByText("참여자 3명")).toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  await userEvent.type(screen.getByRole("textbox"), "저장할 내용");
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByText("회의록을 저장했습니다.");
  const [, options] = fetch.mock.calls.find(([, options]) => options?.method === "PUT")!;
  expect(JSON.parse(options!.body as string)).toEqual({ memo: "저장할 내용" });
  expect(screen.getByText("2026.10.22 14:20")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("link", { name: /캘린더로 돌아가기/ }));
  await screen.findByRole("heading", { name: "달력 복귀" });
  expect(router.state.location.search).toBe("?date=2026-10-21&view=month&scope=mine&room_id=a");
});

it("keeps draft on failed save, blocks link/back navigation and warns on reload", async () => {
  const fetch = api(note);
  fetch.mockImplementation(async (url, options) => options?.method === "PUT"
    ? new Response(JSON.stringify({ detail: { code: "ERROR", message: "저장 실패" } }), { status: 503 })
    : new Response(JSON.stringify(url.startsWith("/api/calendar/") ? [meeting] : note)));
  const router = mount();
  const editor = await screen.findByRole("textbox");
  await userEvent.type(editor, " 수정");
  const before = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(before);
  expect(before.defaultPrevented).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
  expect(editor).toHaveValue("저장할 내용 수정");
  await userEvent.click(screen.getByRole("link", { name: /캘린더로 돌아가기/ }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("저장하지 않은 회의록 내용이 사라집니다.");
  await userEvent.click(screen.getByRole("button", { name: "계속 작성" }));
  expect(editor).toHaveValue("저장할 내용 수정");
  await act(async () => { await router.navigate(-1); });
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "이동" }));
  await screen.findByRole("heading", { name: "달력 복귀" });
});

it("prevents duplicate saves and uses created_at for the first save", async () => {
  const fetch = api();
  let resolveSave!: (response: Response) => void;
  fetch.mockImplementation(async (url, options) => options?.method === "PUT"
    ? new Promise(resolve => { resolveSave = resolve; })
    : new Response(JSON.stringify(url.startsWith("/api/calendar/") ? [meeting] : null)));
  mount();
  await screen.findByRole("textbox");
  await userEvent.type(screen.getByRole("textbox"), "저장할 내용");
  const button = screen.getByRole("button", { name: "저장" });
  fireEvent.click(button); fireEvent.click(button);
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
  expect(button).toBeDisabled();
  expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  resolveSave(new Response(JSON.stringify({ ...note, updated_at: null })));
  await screen.findByText("2026.10.22 14:10");
  await waitFor(() => expect(button).not.toBeDisabled());
});

it("shows permission errors without exposing an editable memo", async () => {
  const fetch = api();
  fetch.mockImplementation(async (url) => url.includes("/memo")
    ? new Response(JSON.stringify({ detail: { code: "MEMO_FORBIDDEN", message: "메모에 접근할 권한이 없습니다." } }), { status: 403 })
    : new Response(JSON.stringify([meeting])));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("메모에 접근할 권한이 없습니다.");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
