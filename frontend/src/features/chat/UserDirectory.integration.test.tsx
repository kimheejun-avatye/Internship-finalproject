import { StrictMode, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UserDirectoryProvider } from "../../shared/users/UserDirectoryProvider";
import ChatPanel from "./ChatPanel";
import FriendListView from "./views/FriendListView";
import CreateChatRoomView from "./views/CreateChatRoomView";
import AttendeePicker from "../reservations/components/AttendeePicker";

const users = [
  { user_id: "real-avatye", name: "김희준", email: "avatye@company.com", team: "AVATYE" },
  { user_id: "real-guru", name: "김희오", email: "guru@company.com", team: "GURU" },
];
const response = () => new Response(JSON.stringify({ items: users, next_cursor: null }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

it("shares one pending directory across friends, chat creation and reservation selection", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn().mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  function Reservation() {
    const [ids, setIds] = useState<string[]>([]);
    return <><AttendeePicker selected={ids} onChange={setIds} capacity={3} /><output aria-label="예약 참석자 ID">{ids.join(",")}</output></>;
  }
  render(<StrictMode><UserDirectoryProvider userId="me">
    <section aria-label="친구 화면"><FriendListView footer={null} onChooseUser={() => {}} /></section>
    <section aria-label="생성 화면"><CreateChatRoomView onBack={() => {}} /></section>
    <section aria-label="예약 화면"><Reservation /></section>
  </UserDirectoryProvider></StrictMode>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /참석자 선택/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(async () => finish(response()));
  for (const label of ["친구 화면", "생성 화면", "예약 화면"]) {
    const section = within(screen.getByRole("region", { name: label }));
    expect(section.getByText("김희준")).toBeInTheDocument();
    expect(section.getByText("김희오")).toBeInTheDocument();
    await user.type(section.getByRole("searchbox"), "김희오");
    expect(section.queryByText("김희준")).not.toBeInTheDocument();
  }
  await user.click(within(screen.getByRole("region", { name: "친구 화면" })).getByRole("button", { name: "김희오 (guru@company.com) 선택" }));

  await user.click(within(screen.getByRole("region", { name: "생성 화면" })).getByRole("checkbox", { name: /김희오/ }));
  expect(screen.getByRole("button", { name: "채팅 연결 준비 중" })).toBeDisabled();
  await user.click(within(screen.getByRole("region", { name: "예약 화면" })).getByRole("checkbox", { name: /김희오/ }));
  expect(screen.getByLabelText("예약 참석자 ID")).toHaveTextContent("real-guru");
  expect(fetch).toHaveBeenCalledOnce();
});

it("opens the live direct room from the shared user picker", async () => {
  const room = {
    chat_room_id: "real-room", type: "DIRECT", title: null, display_title: "김희오", member_count: 2,
    last_message: null, last_activity_at: "2026-10-22T01:00:00Z", created_at: "2026-10-22T01:00:00Z",
    members: [{ user_id: "real-guru", name: "김희오" }],
  };
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/users/search?")) return response();
    if (path.startsWith("/api/chat/rooms?")) return new Response(JSON.stringify({ items: [], next_cursor: null }));
    if (path === "/api/chat/rooms/direct") {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ target_user_id: "real-guru" });
      return new Response(JSON.stringify(room));
    }
    if (path === "/api/chat/rooms/real-room") return new Response(JSON.stringify(room));
    if (path.startsWith("/api/chat/rooms/real-room/messages?")) return new Response(JSON.stringify({ items: [], next_cursor: null }));
    throw new Error("Unexpected path: " + path);
  });
  vi.stubGlobal("fetch", fetch);
  render(<UserDirectoryProvider userId="live-me"><ChatPanel me={{ user_id: "live-me", name: "나", email: "me@company.com", team: "AVATYE" }} /></UserDirectoryProvider>);
  await userEvent.click(await screen.findByRole("button", { name: "김희오 (guru@company.com) 대화 열기" }));
  expect(await screen.findByRole("heading", { name: "김희오" })).toBeInTheDocument();
  expect(await screen.findByRole("textbox", { name: "메시지 입력" })).toBeInTheDocument();
  expect(screen.queryByText(/연결 준비 중/)).not.toBeInTheDocument();
});
