import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CalendarPage from "./CalendarPage";

afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

function renderCalendar(path = "/calendar?date=2026-10-22&view=week") {
  return render(<MemoryRouter initialEntries={[path]}><CalendarPage /></MemoryRouter>);
}

function api(reservations: unknown[] = []) {
  const fetch = vi.fn(async (path: string) => new Response(JSON.stringify(
    path === "/api/calendar/rooms"
      ? [{ room_id: "room-a", name: "회의실 A", status: "ACTIVE", capacity: 6 }]
      : reservations,
  ), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("loads a Korean-time week and requests all reservations before applying the attendee filter", async () => {
  const fetch = api();
  const user = userEvent.setup();
  renderCalendar();
  await screen.findByText("조회 기간에 예약이 없습니다.");
  const first = new URL(fetch.mock.calls.find(([path]) => path.startsWith("/api/calendar/reservations"))![0], "http://local");
  expect(first.searchParams.get("start_at")).toMatch(/T00:00:00\+09:00$/);
  expect(Date.parse(first.searchParams.get("end_at")!) - Date.parse(first.searchParams.get("start_at")!)).toBe(7 * 86400000);
  await user.selectOptions(screen.getByLabelText("예약 범위"), "mine");
  await user.selectOptions(screen.getByLabelText("회의실"), "room-a");
  await waitFor(() => {
    const last = new URL(fetch.mock.calls.filter(([path]) => path.startsWith("/api/calendar/reservations")).at(-1)![0], "http://local");
    expect(last.searchParams.get("scope")).toBe("all");
    expect(last.searchParams.get("room_id")).toBe("room-a");
  });
  await user.selectOptions(screen.getByLabelText("보기"), "month");
  await waitFor(() => {
    const last = new URL(fetch.mock.calls.filter(([path]) => path.startsWith("/api/calendar/reservations")).at(-1)![0], "http://local");
    expect(last.searchParams.get("start_at")).toContain("-01T00:00:00+09:00");
    expect(last.searchParams.get("end_at")).toContain("-01T00:00:00+09:00");
  });
});

it("shows API errors and retries instead of displaying mock reservations", async () => {
  const fetch = api();
  fetch.mockImplementationOnce(async () => new Response("[]", { status: 200 }));
  fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ detail: { code: "ERROR", message: "조회 실패" } }), { status: 500 }));
  renderCalendar();
  expect(await screen.findByRole("alert")).toHaveTextContent("조회 실패");
  expect(screen.queryByText("조회 기간에 예약이 없습니다.")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "다시 조회" }));
  expect(await screen.findByText("조회 기간에 예약이 없습니다.")).toBeInTheDocument();
});

it("renders server reservations and opens the selected day's week from the month", async () => {
  const fetch = api([{
    reservation_id: "r1", title: "실제 회의", room_id: "a", room_name: "회의실 A", organizer_id: "u1",
    start_at: "2026-10-22T10:00:00+09:00", end_at: "2026-10-22T11:00:00+09:00",
    participant_count: 3, is_mine: true, is_attending: false,
  }]);
  renderCalendar("/calendar?date=2026-10-22&view=month");
  expect(await screen.findByText("실제 회의")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "2026-10-22 주간 보기" }));
  expect(await screen.findByText("회의실 A · 참석 3명")).toBeInTheDocument();
  expect(screen.getByLabelText("보기")).toHaveValue("week");
  const last = new URL(fetch.mock.calls.filter(([path]) => path.startsWith("/api/calendar/reservations")).at(-1)![0], "http://local");
  expect(last.searchParams.get("start_at")).toBe("2026-10-19T00:00:00+09:00");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

const meeting = {
  reservation_id: "r1", title: "삭제할 주간 회의", room_id: "room-a", room_name: "회의실 A", organizer_id: "u1",
  start_at: "2026-10-22T10:00:00+09:00", end_at: "2026-10-22T11:00:00+09:00",
  participant_count: 3, is_mine: true, is_attending: true,
};

it("keeps a reservation after failed deletion and reports successful deletion separately from refresh failure", async () => {
  let deleted = false;
  let failDelete = true;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "DELETE") {
      if (failDelete) return new Response(JSON.stringify({ detail: { code: "ERROR", message: "삭제 실패" } }), { status: 503 });
      deleted = true;
      return new Response(null, { status: 204 });
    }
    if (url === "/api/calendar/rooms") return new Response(JSON.stringify([{ room_id: "room-a", name: "회의실 A", status: "ACTIVE", capacity: 6 }]));
    return deleted
      ? new Response(JSON.stringify({ detail: { code: "ERROR", message: "목록 조회 실패" } }), { status: 503 })
      : new Response(JSON.stringify([meeting]));
  });
  vi.stubGlobal("fetch", fetch);
  renderCalendar("/calendar?date=2026-10-22&view=month&room_id=room-a&scope=mine");
  await userEvent.click(await screen.findByRole("button", { name: "삭제" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("모든 사람의 개인 회의록도 함께 삭제");
  expect(screen.getByLabelText("보기")).toHaveValue("month");
  await userEvent.click(screen.getByRole("button", { name: "예약 삭제" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("삭제 실패");
  expect(screen.getAllByText("삭제할 주간 회의")).toHaveLength(2);
  failDelete = false;
  await userEvent.click(screen.getByRole("button", { name: "예약 삭제" }));
  await screen.findByText(/삭제는 완료되었지만 예약 목록/);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("보기")).toHaveValue("month");
  expect(screen.getByLabelText("회의실")).toHaveValue("room-a");
  expect(screen.getByLabelText("예약 범위")).toHaveValue("mine");
  expect(fetch.mock.calls.filter(([, opts]) => opts?.method === "DELETE")).toHaveLength(2);
});

it("hides delete for other users' reservations and disables memo for non-attendees in both views", async () => {
  api([{ ...meeting, is_mine: false, is_attending: false }]);
  renderCalendar();
  expect(await screen.findByRole("button", { name: "회의록" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("보기"), "month");
  expect(await screen.findByRole("button", { name: "회의록" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
});


it("submits one delete while pending and removes the card only after server success", async () => {
  let finish!: (response: Response) => void;
  let removed = false;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "DELETE") return new Promise<Response>(resolve => { finish = resolve; });
    return new Response(JSON.stringify(url === "/api/calendar/rooms" ? [] : removed ? [] : [meeting]));
  });
  vi.stubGlobal("fetch", fetch);
  renderCalendar();
  await userEvent.click(await screen.findByRole("button", { name: "삭제" }));
  const button = screen.getByRole("button", { name: "예약 삭제" });
  fireEvent.click(button); fireEvent.click(button);
  expect(fetch.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(1);
  expect(screen.getAllByText("삭제할 주간 회의")).toHaveLength(2);
  expect(button).toBeDisabled();
  removed = true;
  finish(new Response(null, { status: 204 }));
  await screen.findByText("조회 기간에 예약이 없습니다.");
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
});

it("retains month +N navigation to the selected week", async () => {
  api(Array.from({ length: 4 }, (_, i) => ({ ...meeting, reservation_id: `r${i}`, title: `회의 ${i}` })));
  renderCalendar("/calendar?date=2026-10-22&view=month");
  await userEvent.click(await screen.findByRole("button", { name: "2026-10-22 나머지 1건 주간 보기" }));
  await screen.findByText("회의 3");
  expect(screen.getByLabelText("보기")).toHaveValue("week");
});
