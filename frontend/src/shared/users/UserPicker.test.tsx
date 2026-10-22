import { StrictMode, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UserDirectoryProvider } from "./UserDirectoryProvider";
import UserPicker from "./UserPicker";
import { filterUsersByName } from "./filterUsersByName";
import type { SelectableUser } from "../api/users";

const users: SelectableUser[] = [
  { user_id: "a", name: "김희준", email: "one@example.com", team: "AVATYE" },
  { user_id: "b", name: "김희준", email: "two@example.com", team: "GURU" },
  { user_id: "c", name: "김희오", email: "three@example.com", team: "GURU" },
  { user_id: "d", name: "김의성", email: "four@example.com", team: "GURU" },
];
const response = (items = users) => new Response(JSON.stringify({ items, next_cursor: null }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

it("matches only a trimmed partial name, including Korean composition normalization", () => {
  expect(filterUsersByName(users, " 김희 ").map(user => user.user_id)).toEqual(["a", "b", "c"]);
  expect(filterUsersByName(users, "김희".normalize("NFD"))).toHaveLength(3);
  expect(filterUsersByName(users, "김")).toHaveLength(4);
  expect(filterUsersByName(users, "   ")).toHaveLength(4);
  expect(filterUsersByName(users, "GURU")).toHaveLength(0);
  expect(filterUsersByName(users, "one@example.com")).toHaveLength(0);
});

function Form({ mode = "multiple", excludedIds = [] }: { mode?: "single" | "multiple"; excludedIds?: string[] }) {
  const [ids, setIds] = useState<string[]>([]);
  return <><UserPicker selectionMode={mode} selectedIds={ids} excludedIds={excludedIds} onChange={setIds} /><output aria-label="선택 ID">{ids.join(",")}</output></>;
}

it("keeps duplicate-name identities and multiple selections across queries, excludes joined users", async () => {
  const fetch = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetch);
  render(<StrictMode><UserDirectoryProvider userId="me"><Form excludedIds={["d"]} /></UserDirectoryProvider></StrictMode>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox", { name: "김희준 (one@example.com) 선택" }));
  await user.click(screen.getByRole("checkbox", { name: "김희준 (two@example.com) 선택" }));
  expect(screen.queryByRole("checkbox", { name: /김의성/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText("선택 ID")).toHaveTextContent("a,b");
  const search = screen.getByRole("searchbox", { name: "사용자 이름 검색" });
  await user.type(search, "김희오");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  await user.click(screen.getByRole("checkbox", { name: /김희오/ }));
  expect(screen.getByLabelText("선택 ID")).toHaveTextContent("a,b,c");
  await user.clear(search);
  expect(screen.getAllByRole("checkbox").every(input => (input as HTMLInputElement).checked)).toBe(true);
  await user.type(search, "없는 이름");
  expect(screen.getByText("검색 결과가 없습니다.")).toHaveAttribute("role", "status");
  expect(screen.getByLabelText("선택 ID")).toHaveTextContent("a,b,c");
  expect(fetch).toHaveBeenCalledOnce();
});

it("replaces the ID for single selection and displays email/affiliation", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  render(<UserDirectoryProvider userId="me"><Form mode="single" /></UserDirectoryProvider>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "김희준 (one@example.com) 선택" }));
  expect(screen.getByLabelText("선택 ID")).toHaveTextContent(/^a$/);
  await user.click(screen.getByRole("button", { name: "김희준 (two@example.com) 선택" }));
  expect(screen.getByLabelText("선택 ID")).toHaveTextContent(/^b$/);
  expect(screen.getByText("two@example.com")).toBeInTheDocument();
  expect(screen.getAllByText("GURU")).toHaveLength(3);
});

it("distinguishes loading, failure and an empty list, and retries", async () => {
  let fail!: (response: Response) => void;
  const fetch = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve => { fail = resolve; })).mockResolvedValueOnce(response([]));
  vi.stubGlobal("fetch", fetch);
  render(<UserDirectoryProvider userId="me"><Form /></UserDirectoryProvider>);
  expect(screen.getByText("사용자 목록을 불러오는 중입니다.")).toHaveAttribute("role", "status");
  expect(screen.getByRole("searchbox")).toBeDisabled();
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(async () => fail(new Response("{}", { status: 503 })));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "사용자 목록 다시 조회" }));
  expect(await screen.findByText("선택 가능한 사용자가 없습니다.")).toHaveAttribute("role", "status");
  expect(screen.getByRole("searchbox")).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("refreshes when reopened, preserving valid selections and dropping removed users", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response(users.slice(1)));
  vi.stubGlobal("fetch", fetch);
  function Reopen() {
    const [open, setOpen] = useState(true);
    const [ids, setIds] = useState<string[]>([]);
    return <><button onClick={() => setOpen(value => !value)}>열기/닫기</button>{open && <UserPicker selectionMode="multiple" selectedIds={ids} onChange={setIds} />}<output aria-label="선택 ID">{ids.join(",")}</output></>;
  }
  render(<UserDirectoryProvider userId="me"><Reopen /></UserDirectoryProvider>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox", { name: "김희준 (one@example.com) 선택" }));
  await user.click(screen.getByRole("checkbox", { name: "김희준 (two@example.com) 선택" }));
  await user.click(screen.getByRole("button", { name: "열기/닫기" }));
  await user.click(screen.getByRole("button", { name: "열기/닫기" }));
  expect(await screen.findByRole("checkbox", { name: "김희준 (two@example.com) 선택" })).toBeChecked();
  expect(screen.getByLabelText("선택 ID")).toHaveTextContent(/^b$/);
  expect(fetch).toHaveBeenCalledTimes(2);
});
