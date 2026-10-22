import { StrictMode, type ReactNode } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSelectableUsers } from "./useSelectableUsers";
import { UserDirectoryProvider } from "../users/UserDirectoryProvider";

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode><UserDirectoryProvider userId="me">{children}</UserDirectoryProvider></StrictMode>;

const member = (index: number) => ({ user_id: "u-" + index, name: "사용자 " + index, email: index + "@example.com", team: index % 2 ? "GURU" : "AVATYE" });
const page = (start: number, count: number, cursor: string | null = null) => new Response(JSON.stringify({ items: Array.from({length: count}, (_, i) => member(start + i)), next_cursor: cursor }), {status: 200});
afterEach(() => vi.unstubAllGlobals());

it.each([30, 50])("keeps shared API lookup paginated at 50 and loads %i users once in StrictMode", async count => {
  const fetch = vi.fn(async () => page(0, count)); vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(useSelectableUsers, { wrapper });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.users).toHaveLength(count);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith("/api/users/search?q=&limit=50", expect.objectContaining({method: "GET"}));
});

it("publishes all 80 users only after the final page with the exact encoded cursor", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(page(0,50,"next+/=")).mockReturnValueOnce(new Promise<Response>(resolve => {finish = resolve;}));
  vi.stubGlobal("fetch", fetch);
  const {result} = renderHook(() => useSelectableUsers(), { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(result.current.status).toBe("loading");
  expect(result.current.users).toHaveLength(0);
  expect(fetch.mock.calls[1][0]).toBe("/api/users/search?q=&limit=50&cursor=next%2B%2F%3D");
  await act(async () => finish(page(50,30)));
  expect(result.current.users).toHaveLength(80);
});

it("discards partial results after failure, retries from page one and detects cursor loops", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(page(0,50,"next")).mockResolvedValueOnce(new Response("{}",{status:503})).mockResolvedValueOnce(page(0,1));
  vi.stubGlobal("fetch", fetch);
  const {result} = renderHook(() => useSelectableUsers(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.users).toHaveLength(0);
  await act(async () => { await result.current.retry(); });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.users).toHaveLength(1);
  expect(fetch.mock.calls[2][0]).toBe("/api/users/search?q=&limit=50");
  fetch.mockImplementation(async () => page(0,1,"loop"));
  await act(async () => { await result.current.retry(); });
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(fetch).toHaveBeenCalledTimes(5);
});

it("ignores a stale response after closing and refreshes on reopening", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve => {finish=resolve;})).mockResolvedValueOnce(page(99,1));
  vi.stubGlobal("fetch", fetch);
  const old = renderHook(() => useSelectableUsers(), { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  old.unmount();
  const current = renderHook(() => useSelectableUsers(), { wrapper });
  await waitFor(() => expect(current.result.current.status).toBe("ready"));
  await act(async () => finish(page(0,50,"stale-next")));
  expect(current.result.current.users[0].user_id).toBe("u-99");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("loads lazily, shares concurrent refreshes and caches a completed directory", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => [useSelectableUsers({ enabled: false }), useSelectableUsers({ enabled: false })], { wrapper });
  expect(fetch).not.toHaveBeenCalled();
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => { first = result.current[0].refresh(); second = result.current[1].refresh(); });
  expect(first).toBe(second);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(async () => finish(page(0, 30)));
  expect(result.current[0].users).toBe(result.current[1].users);
  expect(result.current[0].users).toHaveLength(30);
  await act(async () => { await result.current[1].ensureLoaded(); });
  expect(fetch).toHaveBeenCalledOnce();
});

it("shares the whole paginated request across three consumers in StrictMode", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(page(0, 50, "page-2"))
    .mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() => [useSelectableUsers(), useSelectableUsers(), useSelectableUsers()], { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(result.current.every(value => value.status === "loading" && value.users.length === 0)).toBe(true);
  await act(async () => finish(page(50, 30)));
  expect(result.current.every(value => value.status === "ready" && value.users.length === 80)).toBe(true);
  expect(result.current[0].users).toBe(result.current[2].users);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("clears on logout/account change and ignores a previous account's pending pages", async () => {
  let finishOld!: (response: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(page(0, 1))
    .mockReturnValueOnce(new Promise<Response>(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce(page(99, 1));
  vi.stubGlobal("fetch", fetch);
  function Probe() {
    const value = useSelectableUsers();
    return <><div data-testid="members">{value.users.map(user => user.user_id).join(",")}</div><button onClick={() => void value.refresh()}>갱신</button></>;
  }
  const content = (id: string | null) => <UserDirectoryProvider userId={id}><Probe /></UserDirectoryProvider>;
  const view = render(content("account-a"));
  await waitFor(() => expect(screen.getByTestId("members")).toHaveTextContent("u-0"));
  act(() => screen.getByRole("button", { name: "갱신" }).click());
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  view.rerender(content(null));
  expect(screen.getByTestId("members")).toBeEmptyDOMElement();
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(2);
  view.rerender(content("account-b"));
  await waitFor(() => expect(screen.getByTestId("members")).toHaveTextContent("u-99"));
  await act(async () => finishOld(page(1, 50, "stale-next")));
  expect(screen.getByTestId("members")).toHaveTextContent("u-99");
  expect(fetch).toHaveBeenCalledTimes(3);
  view.rerender(content(null));
  expect(screen.getByTestId("members")).toBeEmptyDOMElement();
});

it("cancels the previous account request without emitting auth loss for its late 401", async () => {
  let finishOld!: (response: Response) => void;
  const fetch = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce(page(99, 1));
  vi.stubGlobal("fetch", fetch);
  const lost = vi.fn();
  window.addEventListener("auth:lost", lost);
  try {
    function Probe() {
      const value = useSelectableUsers();
      return <div>{value.users.map(user => user.name).join(",")}</div>;
    }
    const content = (id: string) => <UserDirectoryProvider userId={id}><Probe /></UserDirectoryProvider>;
    const view = render(content("account-a"));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    view.rerender(content("account-b"));
    expect(signal.aborted).toBe(true);
    await screen.findByText("사용자 99");
    await act(async () => finishOld(new Response(JSON.stringify({ detail: { code: "SESSION_REQUIRED" } }), { status: 401 })));
    expect(lost).not.toHaveBeenCalled();
    expect(screen.getByText("사용자 99")).toBeInTheDocument();
  } finally { window.removeEventListener("auth:lost", lost); }
});
