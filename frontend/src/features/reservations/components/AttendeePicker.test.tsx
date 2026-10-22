import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import AttendeePicker from "./AttendeePicker";

afterEach(() => vi.unstubAllGlobals());

it("selects both affiliations by user ID and filters locally without losing selections", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({
    items: [
      { user_id: "avatye-user", name: "김아바티", email: "avatye@example.com", team: "AVATYE" },
      { user_id: "guru-user", name: "김그루", email: "guru@example.com", team: "GURU" },
    ],
    next_cursor: null,
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  function Form() {
    const [selected, setSelected] = useState<string[]>([]);
    return <><AttendeePicker selected={selected} onChange={setSelected} capacity={3} /><output aria-label="선택 ID">{selected.join(",")}</output></>;
  }
  const user = userEvent.setup();
  render(<Form />);
  await user.click(screen.getByRole("button", { name: /참석자 선택/ }));
  const avatye = await screen.findByRole("checkbox", { name: /김아바티/ });
  const guru = screen.getByRole("checkbox", { name: /김그루/ });
  expect(avatye).toBeEnabled();
  expect(guru).toBeEnabled();
  await user.click(avatye);
  const search = screen.getByRole("searchbox", { name: "참석자 이름·이메일·소속 검색" });
  await user.type(search, "gUrU");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  await user.click(screen.getByRole("checkbox", { name: /김그루/ }));
  expect(screen.getByLabelText("선택 ID")).toHaveTextContent("avatye-user,guru-user");
  await user.clear(search);
  expect(screen.getAllByRole("checkbox").every(input => (input as HTMLInputElement).checked)).toBe(true);
  await user.type(search, "김아");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(screen.getByRole("checkbox", { name: /김아바티/ })).toBeChecked();
  expect(screen.getByText("예약자 포함 3명 / 정원 3명")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith("/api/users/search?q=&limit=50", expect.objectContaining({ method: "GET" }));
});


it("does not allow choosing people with another meeting but keeps already chosen ones removable", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    items: [
      { user_id: "free-user", name: "김한가", email: "free@example.com", team: "AVATYE" },
      { user_id: "busy-user", name: "김바쁨", email: "busy@example.com", team: "GURU" },
    ],
    next_cursor: null,
  }), { status: 200 })));
  function Form({ busy }: { busy: ReadonlySet<string> }) {
    const [selected, setSelected] = useState<string[]>(["busy-user"]);
    return <AttendeePicker selected={selected} onChange={setSelected} capacity={5} busyIds={busy} />;
  }
  const user = userEvent.setup();
  const { rerender } = render(<Form busy={new Set()} />);
  await user.click(screen.getByRole("button", { name: /참석자.*선택/ }));
  expect(await screen.findByRole("checkbox", { name: /김바쁨/ })).toBeEnabled();

  // 선택한 시간에 김바쁨의 다른 회의가 생기면: 이미 고른 사람은 해제할 수 있고 경고가 보인다.
  rerender(<Form busy={new Set(["busy-user"])} />);
  expect(screen.getByRole("checkbox", { name: /김바쁨/ })).toBeEnabled();
  expect(screen.getByText(/일정이 겹치는 참석자가 있습니다/)).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: /김바쁨/ }));
  // 해제하고 나면 다시 고를 수 없다.
  expect(screen.getByRole("checkbox", { name: /김바쁨/ })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /김한가/ })).toBeEnabled();
  expect(screen.getByText(/다른 회의 있음/)).toBeInTheDocument();
});
