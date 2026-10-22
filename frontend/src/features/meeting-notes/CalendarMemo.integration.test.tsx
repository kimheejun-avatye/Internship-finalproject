import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import CalendarPage from "../reservations/pages/CalendarPage";
import MeetingNotePage from "./pages/MeetingNotePage";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens a memo from a monthly card and restores calendar date, view, scope and room", async () => {
  const meeting = {
    reservation_id: "r1", title: "연동 회의", room_id: "a", room_name: "회의실 A", organizer_id: "u1",
    start_at: "2026-10-22T10:00:00+09:00", end_at: "2026-10-22T11:00:00+09:00",
    participant_count: 3, is_mine: true, is_attending: true,
  };
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/memo") ? null : url === "/api/calendar/rooms"
    ? [{ room_id: "a", name: "회의실 A", status: "ACTIVE", capacity: 6 }] : [meeting])));
  vi.stubGlobal("fetch", fetch);
  const router = createMemoryRouter([
    { path: "/calendar", element: <CalendarPage /> },
    { path: "/reservations/:reservationId/memo", element: <MeetingNotePage /> },
  ], { initialEntries: ["/calendar?date=2026-10-21&view=month&scope=mine&room_id=a"] });
  render(<RouterProvider router={router} />);
  await userEvent.click(await screen.findByRole("button", { name: "회의록" }));
  await screen.findByRole("textbox", { name: "내 회의록" });
  expect(router.state.location.pathname).toBe("/reservations/r1/memo");
  expect(new URLSearchParams(router.state.location.search).get("date")).toBe("2026-10-22");
  await userEvent.click(screen.getByRole("link", { name: /캘린더로 돌아가기/ }));
  await screen.findByText("연동 회의");
  expect(router.state.location.search).toBe("?date=2026-10-21&view=month&scope=mine&room_id=a");
});
