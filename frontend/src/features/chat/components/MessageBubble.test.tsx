import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import MessageBubble from "./MessageBubble";
import type { ChatMessage } from "../chat.types";

afterEach(cleanup);

const base: ChatMessage = {
  message_id: "m1", chat_room_id: "r1", user_id: "host", sender: { user_id: "host", name: "예약자" },
  message: "[회의실 예약] 주간 회의\n2030-01-07(월) 13:00–14:00\n회의실: A회의실", created_at: "2030-01-07T00:00:00Z", client_id: null,
};

it("renders a server-sent reservation payload as a card", () => {
  render(<MessageBubble own={false} group={false} message={{
    ...base, kind: "RESERVATION",
    payload: { reservation_id: "res", title: "주간 회의", start_at: "2030-01-07T04:00:00Z", end_at: "2030-01-07T05:00:00Z", room_name: "A회의실" },
  }} />);
  const card = screen.getByRole("article", { name: "공유된 회의실 예약" });
  expect(card).toHaveTextContent("주간 회의");
  expect(card).toHaveTextContent("13:00–14:00");
  expect(card).toHaveTextContent("A회의실");
});

it("keeps plain text as a bubble and falls back to the stored text when card data is missing", () => {
  render(<MessageBubble own={false} group={false} message={{ ...base, message: "안녕하세요", kind: "TEXT", payload: null }} />);
  expect(screen.getByText("안녕하세요")).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  cleanup();
  render(<MessageBubble own={false} group={false} message={{ ...base, kind: "RESERVATION", payload: null }} />);
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByText(/\[회의실 예약\] 주간 회의/)).toBeInTheDocument();
});

it("does not turn a user-typed look-alike text into a card", () => {
  render(<MessageBubble own={false} group={false} message={{ ...base, message: "[회의실 예약] 가짜\n2030-01-07(월) 13:00–14:00\n회의실: X" }} />);
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
