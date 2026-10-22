import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSelectableUsers } from "./useSelectableUsers";

const member = (index: number) => ({ user_id: "u-" + index, name: "사용자 " + index, email: index + "@example.com", team: index % 2 ? "GURU" : "AVATYE" });
const page = (start: number, count: number, cursor: string | null = null) => new Response(JSON.stringify({ items: Array.from({length: count}, (_, i) => member(start + i)), next_cursor: cursor }), {status: 200});
afterEach(() => vi.unstubAllGlobals());

it.each([30, 50])("keeps shared API lookup paginated at 50 and loads %i users once in StrictMode", async count => {
  const fetch = vi.fn(async () => page(0, count)); vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(useSelectableUsers, {wrapper: ({children}: {children: ReactNode}) => <StrictMode>{children}</StrictMode>});
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.users).toHaveLength(count);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith("/api/users/search?q=&limit=50", expect.objectContaining({method: "GET"}));
});

it("publishes all 80 users only after the final page with the exact encoded cursor", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(page(0,50,"next+/=")).mockReturnValueOnce(new Promise<Response>(resolve => {finish = resolve;}));
  vi.stubGlobal("fetch", fetch);
  const {result} = renderHook(useSelectableUsers);
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
  const {result} = renderHook(useSelectableUsers);
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.users).toHaveLength(0);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.users).toHaveLength(1);
  expect(fetch.mock.calls[2][0]).toBe("/api/users/search?q=&limit=50");
  fetch.mockImplementation(async () => page(0,1,"loop"));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(fetch).toHaveBeenCalledTimes(5);
});

it("ignores a stale response after closing and refreshes on reopening", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve => {finish=resolve;})).mockResolvedValueOnce(page(99,1));
  vi.stubGlobal("fetch", fetch);
  const old = renderHook(useSelectableUsers);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  old.unmount();
  const current = renderHook(useSelectableUsers);
  await waitFor(() => expect(current.result.current.status).toBe("ready"));
  await act(async () => finish(page(0,50,"stale-next")));
  expect(current.result.current.users[0].user_id).toBe("u-99");
  expect(fetch).toHaveBeenCalledTimes(2);
});
