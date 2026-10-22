import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import CalendarPage from "./CalendarPage";

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  for (const [name, descriptor] of [["showModal", originalShowModal], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

function api(reservations: unknown[] = []) {
  const fetch = vi.fn(async (path: string) => new Response(JSON.stringify(
    path === "/api/calendar/rooms"
      ? [{ room_id: "room-a", name: "회의실 A", status: "ACTIVE", capacity: 6 }]
      : reservations,
  ), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("loads a Korean-time week and sends scope and room filters to the API", async () => {
  const fetch = api();
  const user = userEvent.setup();
  render(<CalendarPage />);
  await screen.findByText("조회 기간에 예약이 없습니다.");
  const first = new URL(fetch.mock.calls.find(([path]) => path.startsWith("/api/calendar/reservations"))![0], "http://local");
  expect(first.searchParams.get("start_at")).toMatch(/T00:00:00\+09:00$/);
  expect(Date.parse(first.searchParams.get("end_at")!) - Date.parse(first.searchParams.get("start_at")!)).toBe(7 * 86400000);
  await user.selectOptions(screen.getByLabelText("예약 범위"), "mine");
  await user.selectOptions(screen.getByLabelText("회의실"), "room-a");
  await waitFor(() => {
    const last = new URL(fetch.mock.calls.filter(([path]) => path.startsWith("/api/calendar/reservations")).at(-1)![0], "http://local");
    expect(last.searchParams.get("scope")).toBe("mine");
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
  render(<CalendarPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("조회 실패");
  expect(screen.queryByText("조회 기간에 예약이 없습니다.")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "다시 조회" }));
  expect(await screen.findByText("조회 기간에 예약이 없습니다.")).toBeInTheDocument();
});

it("renders server reservations and opens the selected day's list", async () => {
  const fetch = api();
  fetch.mockImplementation(async (path: string) => {
    if (path === "/api/calendar/rooms") return new Response("[]", { status: 200 });
    const start = new URL(path, "http://local").searchParams.get("start_at")!.slice(0, 10);
    return new Response(JSON.stringify([{
      reservation_id: "r1", title: "실제 회의", room_id: "a", room_name: "회의실 A", organizer_id: "u1",
      start_at: `${start}T10:00:00+09:00`, end_at: `${start}T11:00:00+09:00`,
      participant_count: 3, is_mine: true, is_attending: false,
    }]), { status: 200 });
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  render(<CalendarPage />);
  expect(await screen.findByText("실제 회의")).toBeInTheDocument();
  expect(screen.getByText("회의실 A · 참석 3명")).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole("button", { name: /예약 보기/ })[0]);
  expect(await screen.findByRole("dialog")).toHaveTextContent("실제 회의");
  await userEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  vi.restoreAllMocks();
});
