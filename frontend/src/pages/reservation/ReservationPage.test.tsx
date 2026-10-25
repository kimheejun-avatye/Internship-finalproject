import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReservationPage from "./ReservationPage";
import * as api from "../../shared/api/reservations";
import { ApiError } from "../../shared/api/client";
import type { CaptchaModalProps } from "@captchavatye/react";

vi.mock("../../shared/api/reservations", async importOriginal => ({
  ...await importOriginal<typeof import("../../shared/api/reservations")>(),
  listRooms: vi.fn(), listReservations: vi.fn(), createReservation: vi.fn(), prepareReservationCaptcha: vi.fn(),
}));
vi.mock("@captchavatye/react", () => ({
  CaptchaModal: (props: CaptchaModalProps) => props.open ? <div role="dialog" aria-label="예약 인증"
    data-challenge-id={props.challenge?.challengeId}>
    <button type="button" onClick={() => props.onComplete({
      challengeId: props.challenge!.challengeId, completionId: "completion-id", creativeId: props.creativeId, clickId: "click-id",
    })}>인증 완료</button>
    <button type="button" onClick={props.onContinue}>예약 계속하기</button>
    <button type="button" onClick={props.onClose}>인증 닫기</button>
  </div> : null,
}));
const firstId = "0a01e4aa-c032-47f8-8751-1a29b069fa0a";
const secondId = "1a01e4aa-c032-47f8-8751-1a29b069fa0a";
const rooms: api.Room[] = [
  { room_id: firstId, name: "DB 회의실 A", status: "ACTIVE", capacity: 6 },
  { room_id: secondId, name: "DB 회의실 B", status: "ACTIVE", capacity: 10 },
  { room_id: "blocked", name: "점검 회의실", status: "BLOCK", capacity: 4 },
];
const item: api.ReservationItem = {
  reservation_id: "saved-id", room_id: firstId, user_id: "user-id", title: "서버에 저장된 예약",
  start_at: "2026-10-18T21:00:00+09:00", end_at: "2026-10-18T21:30:00+09:00",
  participant_count: 2, team: "AVATYE",
};
const empty: api.ReservationList = { items: [], total: 0, page: 1, page_size: 5 };
const captchaAttempt: api.CaptchaAttempt = {
  intent_id: "intent-id", challenge: { challengeId: "challenge-id", creative: {} as api.CaptchaAttempt["challenge"]["creative"] },
  expires_at: "2026-10-18T11:40:00Z",
};
const pageOf = (items: api.ReservationItem[], page = 1, total = items.length): api.ReservationList =>
  ({ items, total, page, page_size: 5 });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-18T11:30:00Z").getTime());
  vi.mocked(api.listRooms).mockResolvedValue(rooms);
  vi.mocked(api.listReservations).mockResolvedValue(empty);
  vi.mocked(api.createReservation).mockResolvedValue({
    ...item, created_at: "2026-10-18T20:30:00+09:00",
  });
  vi.mocked(api.prepareReservationCaptcha).mockResolvedValue(captchaAttempt);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderPage() { return render(<MemoryRouter><ReservationPage /></MemoryRouter>); }

async function fillForm(title = item.title) {
  await screen.findByRole("heading", { name: "DB 회의실 A - 오늘의 일정" });
  await waitFor(() => expect(screen.getByRole("button", { name: "예약하기" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("시작 (한국 시간)"), { target: { value: "2026-10-18T21:00" } });
  fireEvent.change(screen.getByLabelText("종료 (한국 시간)"), { target: { value: "2026-10-18T21:30" } });
  fireEvent.change(screen.getByLabelText("회의 제목"), { target: { value: title } });
}

async function continueBooking() {
  await userEvent.click(await screen.findByRole("button", { name: "인증 완료" }));
  await userEvent.click(screen.getByRole("button", { name: "예약 계속하기" }));
}

it("loads rooms and reservations from APIs and disables blocked rooms", async () => {
  vi.mocked(api.listReservations).mockResolvedValue(pageOf([item]));
  renderPage();
  expect(await screen.findByText(item.title)).toBeInTheDocument();
  expect(api.listReservations).toHaveBeenCalledWith(firstId, 1);
  expect(screen.getByRole("button", { name: /점검 회의실/ })).toBeDisabled();
  expect(screen.getByText("AVATYE / 참석 2명")).toBeInTheDocument();
  expect(screen.getByText("2026-10-18")).toBeInTheDocument();
});

it("prepares authentication before booking, then creates with proof on continue", async () => {
  let finish!: (value: api.CreatedReservation) => void;
  vi.mocked(api.listReservations).mockResolvedValueOnce(empty).mockResolvedValueOnce(pageOf([item]));
  vi.mocked(api.createReservation).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  renderPage();
  await fillForm("  " + item.title + "  ");
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  expect(api.prepareReservationCaptcha).toHaveBeenCalledWith({
    room_id: firstId, title: item.title,
    start_at: "2026-10-18T21:00:00+09:00", end_at: "2026-10-18T21:30:00+09:00",
  });
  expect(api.createReservation).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole("button", { name: "인증 완료" }));
  await userEvent.click(screen.getByRole("button", { name: "예약 계속하기" }));
  expect(api.createReservation).toHaveBeenCalledWith({
    room_id: firstId, title: item.title,
    start_at: "2026-10-18T21:00:00+09:00", end_at: "2026-10-18T21:30:00+09:00",
  }, { intent_id: "intent-id", challenge_id: "challenge-id", completion_id: "completion-id" });
  const pending = screen.getByRole("button", { name: "예약 중..." });
  expect(pending).toBeDisabled();
  await userEvent.click(pending);
  expect(api.createReservation).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ...item, created_at: item.start_at }));
  expect(await screen.findByText(item.title)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("예약이 저장되었습니다.");
});

it("shows server conflict without inventing a saved reservation", async () => {
  vi.mocked(api.createReservation).mockRejectedValue(new ApiError(409, "RESERVATION_CONFLICT", "이미 예약된 시간과 겹칩니다."));
  renderPage();
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  await continueBooking();
  expect(await screen.findByRole("alert")).toHaveTextContent("이미 예약된 시간과 겹칩니다.");
  expect(screen.queryByText(item.title)).not.toBeInTheDocument();
  expect(screen.getByLabelText("회의 제목")).toHaveValue(item.title);
  expect(screen.getByRole("button", { name: "예약하기" })).toBeEnabled();
});

it("keeps successful creation separate from a failed list refresh", async () => {
  vi.mocked(api.listReservations).mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error("목록 연결 오류"));
  renderPage();
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  await continueBooking();
  expect(await screen.findByRole("status")).toHaveTextContent("예약이 저장되었습니다.");
  expect(await screen.findByRole("alert")).toHaveTextContent("목록 연결 오류");
  expect(api.createReservation).toHaveBeenCalledTimes(1);
  vi.mocked(api.listReservations).mockResolvedValue(pageOf([item]));
  await userEvent.click(screen.getByRole("button", { name: "목록 다시 조회" }));
  expect(await screen.findByText(item.title)).toBeInTheDocument();
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
  let finishFirst!: (data: api.ReservationList) => void;
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
  let finish!: (value: api.CreatedReservation) => void;
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
  await continueBooking();
  expect(api.createReservation).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("link", { name: "캘린더로 이동" }));
  expect(screen.getByRole("heading", { name: "캘린더 화면" })).toBeInTheDocument();
  await act(async () => finish({ ...item, created_at: item.start_at }));
  expect(screen.getByRole("heading", { name: "캘린더 화면" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "회의실 예약" })).not.toBeInTheDocument();
});

it.each([
  [" ", "2026-10-18T21:00", "2026-10-18T21:30", "회의 제목을 입력해 주세요."],
  ["회의", "2026-10-18T21:00", "2026-10-18T20:45", "종료 시간은 시작 시간보다 늦어야 합니다."],
  ["회의", "2026-10-18T20:00", "2026-10-18T20:15", "시작 시각은 과거일 수 없습니다."],
])("rejects invalid form values without posting: %s %s", async (title, start, end, message) => {
  renderPage();
  await fillForm(title);
  fireEvent.change(screen.getByLabelText("시작 (한국 시간)"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("종료 (한국 시간)"), { target: { value: end } });
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(api.prepareReservationCaptcha).not.toHaveBeenCalled();
  expect(api.createReservation).not.toHaveBeenCalled();
});

it("retries the same proof after an uncertain booking failure", async () => {
  vi.mocked(api.createReservation)
    .mockRejectedValueOnce(new ApiError(0, "NETWORK", "연결 오류"))
    .mockResolvedValueOnce({ ...item, created_at: item.start_at });
  renderPage();
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  await continueBooking();
  expect(await screen.findByRole("alert")).toHaveTextContent("연결 오류");
  expect(screen.getByLabelText("회의 제목")).toHaveValue(item.title);
  await userEvent.click(screen.getByRole("button", { name: "예약 재시도" }));
  expect(await screen.findByRole("status")).toHaveTextContent("예약이 저장되었습니다.");
  expect(api.prepareReservationCaptcha).toHaveBeenCalledTimes(1);
  expect(api.createReservation).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.createReservation).mock.calls[0][1]).toEqual(vi.mocked(api.createReservation).mock.calls[1][1]);
});

it.each([6, 11])("retries the exact submitted reservation after %s minutes", async minutes => {
  vi.mocked(api.createReservation)
    .mockRejectedValueOnce(new ApiError(0, "NETWORK", "응답이 끊겼습니다."))
    .mockResolvedValueOnce({ ...item, created_at: item.start_at });
  renderPage();
  await fillForm();
  fireEvent.change(screen.getByLabelText("시작 (한국 시간)"), { target: { value: "2026-10-18T20:35" } });
  fireEvent.change(screen.getByLabelText("종료 (한국 시간)"), { target: { value: "2026-10-18T21:05" } });
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  await continueBooking();
  expect(await screen.findByRole("alert")).toHaveTextContent("응답이 끊겼습니다.");

  vi.mocked(Date.now).mockReturnValue(new Date("2026-10-18T11:30:00Z").getTime() + minutes * 60_000);
  await userEvent.click(screen.getByRole("button", { name: "예약 재시도" }));

  expect(await screen.findByRole("status")).toHaveTextContent("예약이 저장되었습니다.");
  expect(api.prepareReservationCaptcha).toHaveBeenCalledTimes(1);
  expect(api.createReservation).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.createReservation).mock.calls[0]).toEqual(vi.mocked(api.createReservation).mock.calls[1]);
});

it("starts a new authentication only after the server explicitly rejects the expired attempt", async () => {
  vi.mocked(api.prepareReservationCaptcha)
    .mockResolvedValueOnce(captchaAttempt)
    .mockResolvedValueOnce({ ...captchaAttempt, intent_id: "fresh-intent", challenge: { ...captchaAttempt.challenge, challengeId: "fresh-challenge" } });
  vi.mocked(api.createReservation)
    .mockRejectedValueOnce(new ApiError(403, "CAPTCHA_EXPIRED", "인증 시간이 만료되었습니다."))
    .mockResolvedValueOnce({ ...item, created_at: item.start_at });
  renderPage();
  await fillForm();
  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  await continueBooking();
  expect(await screen.findByRole("alert")).toHaveTextContent("인증 시간이 만료되었습니다.");

  await userEvent.click(screen.getByRole("button", { name: "예약하기" }));
  expect(api.prepareReservationCaptcha).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("dialog")).toHaveAttribute("data-challenge-id", "fresh-challenge");
  await continueBooking();
  expect(await screen.findByRole("status")).toHaveTextContent("예약이 저장되었습니다.");
  expect(vi.mocked(api.createReservation).mock.calls[0][1]).toEqual({
    intent_id: "intent-id", challenge_id: "challenge-id", completion_id: "completion-id",
  });
  expect(vi.mocked(api.createReservation).mock.calls[1][1]).toEqual({
    intent_id: "fresh-intent", challenge_id: "fresh-challenge", completion_id: "completion-id",
  });
});
