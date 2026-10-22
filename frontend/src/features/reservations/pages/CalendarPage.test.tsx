import { render, screen, waitFor, cleanup } from "@testing-library/react";
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

it("loads a Korean-time week and requests all reservations before applying the creator filter", async () => {
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
