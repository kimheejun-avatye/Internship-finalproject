import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReservationPage from "./ReservationPage";
import * as api from "../reservations.api";
import type { Room, ReservationItem, ReservationList, CreatedReservation } from "../reservations.types";
import { ApiError } from "../../../shared/api/client";

vi.mock("../reservations.api", () => ({
  listRooms: vi.fn(), listReservations: vi.fn(), createReservation: vi.fn(), getAvailability: vi.fn(), getBusyUsers: vi.fn(),
}));
vi.mock("../../../shared/hooks/useSelectableUsers", () => ({
  useSelectableUsers: () => ({
    status: "ready", error: "", retry: vi.fn(),
    users: [{ user_id: "busy-user", name: "김바쁨", email: "busy@example.com", team: "AVATYE" }],
  }),
}));
const firstId = "0a01e4aa-c032-47f8-8751-1a29b069fa0a";
const secondId = "1a01e4aa-c032-47f8-8751-1a29b069fa0a";
const rooms: Room[] = [
  { room_id: firstId, name: "DB 회의실 A", status: "ACTIVE", capacity: 6 },
  { room_id: secondId, name: "DB 회의실 B", status: "ACTIVE", capacity: 10 },
  { room_id: "blocked", name: "점검 회의실", status: "BLOCK", capacity: 4 },
];
const item: ReservationItem = {
  reservation_id: "saved-id", room_id: firstId, user_id: "user-id", title: "서버에 저장된 예약",
  start_at: "2026-10-19T21:00:00+09:00", end_at: "2026-10-19T22:00:00+09:00",
  participant_count: 2, team: "AVATYE",
};
const empty: ReservationList = { items: [], total: 0, page: 1, page_size: 5 };
const pageOf = (items: ReservationItem[], page = 1, total = items.length): ReservationList =>
  ({ items, total, page, page_size: 5 });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-19T11:30:00Z").getTime());
  vi.mocked(api.listRooms).mockResolvedValue(rooms);
  vi.mocked(api.getAvailability).mockImplementation(async (_roomId, date) => Array.from({ length: 24 }, (_, hour) => {
    const start = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+09:00`);
    return { start_at: start.toISOString(), end_at: new Date(start.getTime() + 3_600_000).toISOString(), available: start.getTime() > Date.now(), reason: start.getTime() > Date.now() ? null : "PAST" };
  }));
  vi.mocked(api.listReservations).mockResolvedValue(empty);
  vi.mocked(api.getBusyUsers).mockResolvedValue({ user_ids: [] });
  vi.mocked(api.createReservation).mockResolvedValue({
    ...item, created_at: "2026-10-19T20:30:00+09:00",
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function CalendarDestination() {
  const location = useLocation();
  return <><h1>캘린더 화면</h1><p role="status">{location.state?.message}</p><div>{location.search}</div></>;
}
function renderPage() {
  return render(<MemoryRouter initialEntries={["/reservations?date=2026-10-19"]}><Routes>
    <Route path="/reservations" element={<ReservationPage />} />
    <Route path="/calendar" element={<CalendarDestination />} />
  </Routes></MemoryRouter>);
}

async function fillForm(title = item.title) {
  await screen.findByRole("heading", { name: "DB 회의실 A · 오늘 남은 일정" });
  await waitFor(() => expect(screen.getByRole("button", { name: "예약하기" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("시작 (한국 시간)"), { target: { value: "21:00" } });
  fireEvent.change(screen.getByLabelText("종료 (한국 시간)"), { target: { value: "22:00" } });
  fireEvent.change(screen.getByLabelText("회의 제목"), { target: { value: title } });
}

it("loads rooms and reservations from APIs and disables blocked rooms", async () => {
  vi.mocked(api.listReservations).mockResolvedValue(pageOf([item]));
  renderPage();
  expect(await screen.findByText(item.title)).toBeInTheDocument();
  expect(api.listReservations).toHaveBeenCalledWith(firstId, 1);
  expect(screen.getByRole("button", { name: /점검 회의실/ })).toBeDisabled();
  expect(screen.getByText("AVATYE / 참석 2명")).toBeInTheDocument();
  expect(screen.getByLabelText("예약 날짜")).toHaveValue("2026-10-19");
});

it("creates hourly reservations with Korean offsets, prevents repeats, and returns to the reserved week", async () => {
  let finish!: (value: CreatedReservation) => void;
  vi.mocked(api.listReservations).mockResolvedValueOnce(empty).mockResolvedValueOnce(pageOf([item]));
  vi.mocked(api.createReservation).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  renderPage();
  await fillForm("  " + item.title + "  ");
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  expect(api.createReservation).toHaveBeenCalledWith({
    room_id: firstId, title: item.title,
    start_at: "2026-10-19T21:00:00+09:00", end_at: "2026-10-19T22:00:00+09:00", attendee_ids: [],
  });
  const pending = screen.getByRole("button", { name: "예약 중..." });
  expect(pending).toBeDisabled();
  await userEvent.click(pending);
  expect(api.createReservation).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ...item, created_at: item.start_at }));
  expect(await screen.findByRole("heading", { name: "캘린더 화면" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("예약이 저장되었습니다.");
  expect(screen.getByText(/date=2026-10-19&view=week/)).toBeInTheDocument();
});

it("shows server conflict without inventing a saved reservation", async () => {
  vi.mocked(api.createReservation).mockRejectedValue(new ApiError(409, "RESERVATION_CONFLICT", "이미 예약된 시간과 겹칩니다."));
  renderPage();
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("이미 예약된 시간과 겹칩니다.");
  expect(screen.queryByText(item.title)).not.toBeInTheDocument();
  expect(screen.getByLabelText("회의 제목")).toHaveValue(item.title);
  await waitFor(() => expect(screen.getByRole("button", { name: "예약하기" })).toBeEnabled());
});

it("keeps a successful save when returning to calendar instead of refreshing the old list", async () => {
  vi.mocked(api.listReservations).mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error("목록 연결 오류"));
  renderPage();
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  expect(await screen.findByRole("heading", { name: "캘린더 화면" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("예약이 저장되었습니다.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.listReservations).toHaveBeenCalledTimes(1);
  expect(api.createReservation).toHaveBeenCalledTimes(1);
});

it("uses server pages and resets to page one when changing rooms", async () => {
  vi.mocked(api.listReservations).mockImplementation(async (roomId, page) =>
    roomId === secondId ? empty : pageOf([{ ...item, title: page === 1 ? "첫 페이지" : "둘째 페이지" }], page, 6));
  renderPage();
  await screen.findByText("첫 페이지");
  await userEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
  await screen.findByText("둘째 페이지");
  expect(api.listReservations).toHaveBeenLastCalledWith(firstId, 2);
  expect(screen.getByRole("button", { name: "다음 페이지" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: /DB 회의실 B/ }));
  await waitFor(() => expect(api.listReservations).toHaveBeenLastCalledWith(secondId, 1));
  expect(screen.queryByText("둘째 페이지")).not.toBeInTheDocument();
});

it("ignores late responses for the previously selected room", async () => {
  let finishFirst!: (data: ReservationList) => void;
  vi.mocked(api.listReservations).mockImplementation((roomId) => roomId === firstId
    ? new Promise(resolve => { finishFirst = resolve; })
    : Promise.resolve(pageOf([{ ...item, room_id: secondId, title: "B의 예약" }])));
  renderPage();
  await waitFor(() => expect(api.listReservations).toHaveBeenCalledWith(firstId, 1));
  await userEvent.click(screen.getByRole("button", { name: /DB 회의실 B/ }));
  expect(await screen.findByText("B의 예약")).toBeInTheDocument();
  await act(async () => finishFirst(pageOf([item])));
  expect(screen.getByText("B의 예약")).toBeInTheDocument();
  expect(screen.queryByText(item.title)).not.toBeInTheDocument();
});

it("shows a room load error and retries without a fabricated room", async () => {
  vi.mocked(api.listRooms).mockRejectedValueOnce(new Error("회의실 연결 오류")).mockResolvedValueOnce(rooms);
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("회의실 연결 오류");
  await userEvent.click(screen.getByRole("button", { name: "회의실 다시 조회" }));
  expect(await screen.findByRole("button", { name: /DB 회의실 A/ })).toBeInTheDocument();
});


it("does not navigate back after a pending creation finishes on another screen", async () => {
  let finish!: (value: CreatedReservation) => void;
  vi.mocked(api.createReservation).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<MemoryRouter initialEntries={["/reservations"]}>
    <Link to="/calendar">캘린더로 이동</Link>
    <Routes>
      <Route path="/reservations" element={<ReservationPage />} />
      <Route path="/calendar" element={<h1>캘린더 화면</h1>} />
    </Routes>
  </MemoryRouter>);
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  expect(api.createReservation).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("link", { name: "캘린더로 이동" }));
  expect(screen.getByRole("heading", { name: "캘린더 화면" })).toBeInTheDocument();
  await act(async () => finish({ ...item, created_at: item.start_at }));
  expect(screen.getByRole("heading", { name: "캘린더 화면" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "회의실 예약" })).not.toBeInTheDocument();
});

it.each([
  [" ", "21:00", "22:00", "회의 제목을 입력해 주세요."],
  ["회의", "21:00", "20:00", "선택한 구간에 예약할 수 없는 시간이 있습니다."],
  ["회의", "20:00", "21:00", "시작 시각은 과거일 수 없습니다."],
])("rejects invalid form values without posting: %s %s", async (title, start, end, message) => {
  renderPage();
  await fillForm(title);
  fireEvent.change(screen.getByLabelText("시작 (한국 시간)"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("종료 (한국 시간)"), { target: { value: end } });
  fireEvent.submit(screen.getByRole("button", { name: "예약하기" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(api.createReservation).not.toHaveBeenCalled();
});


it("blocks the reservation button when a chosen attendee has another meeting at the newly chosen time", async () => {
  // 22시 시작 구간에서만 김바쁨에게 다른 회의가 있다.
  vi.mocked(api.getBusyUsers).mockImplementation(async start => ({ user_ids: start.includes("T22:00") ? ["busy-user"] : [] }));
  renderPage();
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: /참석자 선택/ }));
  await userEvent.click(await screen.findByRole("checkbox", { name: /김바쁨/ }));
  await userEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(screen.getByRole("button", { name: "예약하기" })).toBeEnabled();

  fireEvent.change(screen.getByLabelText("시작 (한국 시간)"), { target: { value: "22:00" } });
  fireEvent.change(screen.getByLabelText("종료 (한국 시간)"), { target: { value: "23:00" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "예약하기" })).toBeDisabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // 별도 안내문 없이 버튼만 막는다.
  expect(api.getBusyUsers).toHaveBeenLastCalledWith("2026-10-19T22:00:00+09:00", "2026-10-19T23:00:00+09:00");

  // 선택을 해제하면 다시 예약할 수 있다.
  await userEvent.click(screen.getByRole("button", { name: /참석자.*선택/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: /김바쁨/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "예약하기" })).toBeEnabled());
});

it("shows hours blocked by my other meetings as unavailable", async () => {
  vi.mocked(api.getAvailability).mockImplementation(async (_roomId, date) => Array.from({ length: 24 }, (_, hour) => {
    const start = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+09:00`);
    const mine = hour === 21;
    return { start_at: start.toISOString(), end_at: new Date(start.getTime() + 3_600_000).toISOString(),
      available: start.getTime() > Date.now() && !mine, reason: mine ? "MY_MEETING" : null };
  }));
  renderPage();
  await screen.findByRole("heading", { name: "DB 회의실 A · 오늘 남은 일정" });
  const option = await screen.findByRole("option", { name: "21:00 · 내 다른 회의" });
  expect(option).toBeDisabled();
});
