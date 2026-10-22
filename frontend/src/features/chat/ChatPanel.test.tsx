import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import ChatPanel from "./ChatPanel";
import { createMockChat } from "./mocks/chat.mock";
import { getChatData } from "./chat.data";
import { formatChatTime } from "./components/MessageBubble";

afterEach(() => vi.unstubAllGlobals());

it("provides 15 users per organization, each department mix, and isolated rooms", () => {
  for (const team of ["AVATYE", "GURU"] as const) {
    const state = createMockChat(team).getSnapshot();
    expect(state.users).toHaveLength(30);
    const members = state.users.filter(u => u.team === team);
    expect(members).toHaveLength(15);
    expect(members.filter(u => u.profile?.startsWith("개발팀"))).toHaveLength(4);
    expect(members.filter(u => u.profile?.startsWith("디자인팀"))).toHaveLength(3);
    expect(state.rooms.filter(r => r.type === "DIRECT")).toHaveLength(2);
    expect(state.rooms.filter(r => r.type === "GROUP")).toHaveLength(3);
    expect(Object.values(state.messages).filter(m => m.length === 12)).toHaveLength(4);
    expect(new Set(state.users.map(u => u.user_id)).size).toBe(30);
    expect(state.users.some(u => u.user_id === state.me.user_id)).toBe(false);
  }
});

it("filters all friends immediately by name, organization and profile without HTTP", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const data = createMockChat("AVATYE");
  const user = userEvent.setup();
  render(<StrictMode><ChatPanel data={data} /></StrictMode>);
  expect(within(screen.getByRole("list", { name: "친구 목록" })).getAllByRole("listitem")).toHaveLength(30);
  const search = screen.getByRole("searchbox", { name: "이름 또는 팀 검색" });
  await user.type(search, "김희");
  expect(screen.getAllByRole("button", { name: /대화 열기$/ })).toHaveLength(2);
  await user.clear(search); await user.type(search, "gUrU");
  expect(screen.getAllByRole("button", { name: /대화 열기$/ })).toHaveLength(15);
  expect(screen.getAllByRole("button", { name: /대화 열기$/ }).every(button => !button.hasAttribute("disabled"))).toBe(true);
  await user.clear(search); await user.type(search, "프론트엔드");
  expect(screen.getAllByRole("button", { name: /대화 열기$/ })).toHaveLength(2);
  await user.clear(search);
  expect(screen.getAllByRole("button", { name: /대화 열기$/ })).toHaveLength(30);
  expect(fetch).not.toHaveBeenCalled();
});

it("opens a direct room immediately, reuses it, keeps tabs and returns to friends", async () => {
  const data = createMockChat("AVATYE");
  const user = userEvent.setup();
  render(<ChatPanel data={data} />);
  await user.click(screen.getByRole("button", { name: "김희준 (AVATYE) 대화 열기" }));
  expect(screen.getByRole("heading", { name: "김희준" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "AVATYE 메신저" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "채팅 목록" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("접속 중")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "더보기 (준비 중)" })).toBeDisabled();
  expect(data.getSnapshot().rooms).toHaveLength(5);
  await user.click(screen.getByRole("button", { name: "이전 목록으로 돌아가기" }));
  expect(screen.getByRole("list", { name: "친구 목록" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "김희준 (AVATYE) 대화 열기" }));
  expect(data.getSnapshot().rooms).toHaveLength(5);
});

it("creates a mixed-organization group and supports chips and searches", async () => {
  const data = createMockChat("AVATYE");
  const user = userEvent.setup();
  render(<ChatPanel data={data} />);
  await user.click(screen.getByRole("button", { name: "새 채팅" }));
  expect(screen.getByRole("button", { name: "0명과 채팅 시작" })).toBeDisabled();
  expect(screen.getAllByRole("checkbox").every(input => !input.hasAttribute("disabled"))).toBe(true);
  const title = screen.getByRole("textbox", { name: "채팅방 이름 (선택)" });
  expect(title).toHaveAttribute("maxlength", "50");
  await user.click(screen.getByRole("checkbox", { name: /김희준.*선택$/ }));
  expect(title).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: /김희오.*선택$/ }));
  expect(title).toBeEnabled();
  await user.click(screen.getByRole("button", { name: /김희준.*선택 해제$/ }));
  expect(screen.getByRole("checkbox", { name: /김희준.*선택$/ })).not.toBeChecked();
  await user.type(screen.getByRole("searchbox"), "프론트엔드");
  await user.click(screen.getByRole("checkbox", { name: /김희준.*선택$/ }));
  await user.type(title, "새 디자인 리뷰");
  await user.click(screen.getByRole("button", { name: "2명과 채팅 시작" }));
  expect(screen.getByRole("heading", { name: "새 디자인 리뷰" })).toBeInTheDocument();
  expect(screen.getByText("3명")).toBeInTheDocument();
  expect(screen.getByText(/아직 메시지가 없습니다/)).toBeInTheDocument();
  expect(data.getSnapshot().rooms).toHaveLength(6);
  expect(data.getSnapshot().rooms.at(-1)?.members.map(member => member.user_id).sort()).toEqual(["mock-avatye-01", "mock-guru-01"]);
  expect(() => data.createRoom(["missing-user"])).toThrow("대화할 수 없는 사용자");
});

it("creates a direct room for one person and automatic group titles in the data layer", async () => {
  const data = createMockChat("GURU");
  const user = userEvent.setup();
  render(<ChatPanel data={data} />);
  await user.click(screen.getByRole("button", { name: "새 채팅" }));
  await user.click(screen.getByRole("checkbox", { name: /김의성.*선택$/ }));
  await user.click(screen.getByRole("button", { name: "1명과 채팅 시작" }));
  expect(screen.getByRole("heading", { name: "김의성" })).toBeInTheDocument();
  let id = "";
  act(() => { id = data.createRoom(["mock-guru-02", "mock-guru-03"], " "); });
  const room = data.getSnapshot().rooms.find(r => r.chat_room_id === id)!;
  expect(room.display_title).toBe("김의성, 이준서");
  expect(room.member_count).toBe(3);
  expect(() => data.createRoom(["mock-guru-02", "mock-guru-03"], "가".repeat(51))).toThrow("50자");
});

it("searches message history, marks rooms read and updates order after sending", async () => {
  const data = createMockChat("AVATYE");
  const user = userEvent.setup();
  render(<ChatPanel data={data} />);
  await user.click(screen.getByRole("tab", { name: "채팅 목록" }));
  await user.click(screen.getByRole("button", { name: /안 읽음/ }));
  expect(within(screen.getByRole("list", { name: "채팅방 목록" })).getAllByRole("listitem")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "김민서 대화 열기" }));
  await user.click(screen.getByRole("button", { name: "이전 목록으로 돌아가기" }));
  await user.type(screen.getByRole("searchbox"), "접근성");
  expect(within(screen.getByRole("list", { name: "채팅방 목록" })).getAllByRole("listitem")).toHaveLength(4);
  await user.clear(screen.getByRole("searchbox"));
  await user.click(screen.getByRole("button", { name: /안 읽음/ }));
  expect(within(screen.getByRole("list", { name: "채팅방 목록" })).getAllByRole("listitem")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "전체" }));
  await user.click(screen.getByRole("button", { name: "김희준 대화 열기" }));
  await user.type(screen.getByRole("textbox", { name: "메시지 입력" }), "  새 메시지  {Enter}");
  expect(screen.getByText("새 메시지")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "채팅 목록" }));
  expect(within(screen.getByRole("list", { name: "채팅방 목록" })).getAllByRole("button")[0]).toHaveAccessibleName("김희준 대화 열기");
  expect(screen.getByText("새 메시지")).toBeInTheDocument();
});

it("preserves room drafts across conversations and unmounts without sending during Korean composition", async () => {
  const data = createMockChat("AVATYE");
  const user = userEvent.setup();
  const view = render(<ChatPanel data={data} />);
  await user.click(screen.getByRole("button", { name: "김희준 (AVATYE) 대화 열기" }));
  const input = screen.getByRole("textbox", { name: "메시지 입력" });
  const roomId = "mock-avatye-room-1";
  await user.type(input, "첫 줄{Shift>}{Enter}{/Shift}두 번째");
  expect(input).toHaveValue("첫 줄\n두 번째");
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  expect(data.getSnapshot().messages[roomId]).toHaveLength(12);
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(data.getSnapshot().messages[roomId]).toHaveLength(12);
  await user.click(screen.getByRole("tab", { name: "친구" }));
  await user.click(screen.getByRole("button", { name: "김민서 (AVATYE) 대화 열기" }));
  expect(screen.getByRole("textbox", { name: "메시지 입력" })).toHaveValue("");
  await user.type(screen.getByRole("textbox", { name: "메시지 입력" }), "별도 초안");
  view.unmount();
  render(<ChatPanel data={data} />);
  expect(screen.getByRole("textbox", { name: "메시지 입력" })).toHaveValue("별도 초안");
  await user.click(screen.getByRole("tab", { name: "친구" }));
  await user.click(screen.getByRole("button", { name: "김희준 (AVATYE) 대화 열기" }));
  expect(screen.getByRole("textbox", { name: "메시지 입력" })).toHaveValue("첫 줄\n두 번째");
  await user.click(screen.getByRole("textbox", { name: "메시지 입력" }));
  await user.keyboard("{Enter}");
  expect(data.getSnapshot().messages[roomId].at(-1)?.message).toBe("첫 줄\n두 번째");
});

it("enforces trimmed 1–2000 characters and never calls the server", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const data = createMockChat("AVATYE");
  const roomId = data.createRoom(["mock-avatye-02"]);
  data.openRoom(roomId, "friends");
  render(<ChatPanel data={data} />);
  const input = screen.getByRole("textbox", { name: "메시지 입력" });
  fireEvent.change(input, { target: { value: " \n " } });
  expect(screen.getByRole("button", { name: "전송" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "가".repeat(2001) } });
  expect(screen.getByRole("button", { name: "전송" })).toBeDisabled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(data.getSnapshot().messages[roomId]).toHaveLength(0);
  fireEvent.change(input, { target: { value: "  " + "가".repeat(2000) + "  " } });
  fireEvent.click(screen.getByRole("button", { name: "전송" }));
  expect(data.getSnapshot().messages[roomId][0].message).toHaveLength(2000);
  expect(input).toHaveValue("");
  expect(fetch).not.toHaveBeenCalled();
});

it("prepends older history while preserving the scroll offset and shows dates and cards", async () => {
  const data = createMockChat("AVATYE");
  data.openRoom("mock-avatye-room-3", "rooms");
  const { container } = render(<ChatPanel data={data} />);
  const body = container.querySelector(".chat-layout-body") as HTMLDivElement;
  Object.defineProperty(body, "scrollHeight", { configurable: true, get: () => container.querySelectorAll("[data-message-id]").length === 8 ? 800 : 1200 });
  body.scrollTop = 80;
  fireEvent.click(screen.getByRole("button", { name: "이전 메시지 보기" }));
  expect(body.scrollTop).toBe(480);
  expect(container.querySelectorAll("[data-message-id]")).toHaveLength(12);
  expect(screen.getByText("2026년 10월 15일 목요일")).toBeInTheDocument();
  expect(screen.getByText("2026년 10월 16일 금요일")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "공유된 회의실 예약" })).toBeInTheDocument();
  expect(screen.getAllByText("3명 확인").length).toBeGreaterThan(0);
  expect(formatChatTime("2026-10-16T05:09:00Z")).toBe("14:09");
});

it("retains its module data through navigation but new instances start clean", () => {
  const data = getChatData("GURU");
  const room = data.createRoom(["mock-guru-02"]);
  act(() => data.setDraft(room, "페이지 이동 후에도 유지"));
  expect(getChatData("GURU").getSnapshot().drafts[room]).toBe("페이지 이동 후에도 유지");
  expect(createMockChat("GURU").getSnapshot().drafts).toEqual({});
});

it("opens and reuses cross-organization direct rooms and sends messages", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const data = createMockChat("AVATYE");
  const user = userEvent.setup();
  render(<ChatPanel data={data} />);
  expect(screen.queryByText(/같은 소속/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "김희오 (GURU) 대화 열기" }));
  expect(screen.getByRole("heading", { name: "김희오" })).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "메시지 입력" }), "소속과 관계없이 대화합니다.{Enter}");
  const room = data.getSnapshot().rooms.at(-1)!;
  expect(data.getSnapshot().messages[room.chat_room_id].at(-1)?.message).toBe("소속과 관계없이 대화합니다.");
  await user.click(screen.getByRole("button", { name: "이전 목록으로 돌아가기" }));
  await user.click(screen.getByRole("button", { name: "김희오 (GURU) 대화 열기" }));
  expect(data.getSnapshot().rooms).toHaveLength(6);
  expect(screen.getByText("소속과 관계없이 대화합니다.")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
