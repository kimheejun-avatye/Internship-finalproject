import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { getSelectableUsersPage, type SelectableUser, type UserPage } from "../api/users";

type DirectoryState = {
  status: "idle" | "loading" | "ready" | "error";
  users: SelectableUser[];
  error: string;
};
type Directory = DirectoryState & { ensureLoaded: () => Promise<void>; refresh: () => Promise<void> };
type Props = {
  children: ReactNode;
  userId: string | null;
  // Standalone previews inject a local source; application screens use the API default.
  loadPage?: (cursor?: string, signal?: AbortSignal) => Promise<UserPage>;
};
export const UserDirectoryContext = createContext<Directory | null>(null);
const empty: DirectoryState = { status: "idle", users: [], error: "" };

export function UserDirectoryProvider(props: Props) {
  // An account change discards both cached users and account-specific selections.
  return <DirectoryScope key={props.userId ?? "guest"} {...props} />;
}

function DirectoryScope({ children, userId, loadPage = getSelectableUsersPage }: Props) {
  const [state, setState] = useState<DirectoryState>(empty);
  const current = useRef(state);
  const pending = useRef<Promise<void> | null>(null);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); };
  }, []);

  const load = useCallback((force: boolean): Promise<void> => {
    if (!userId || !active.current) return Promise.resolve();
    if (pending.current) return pending.current;
    if (!force && current.current.status !== "idle") return Promise.resolve();
    const requestController = new AbortController();
    controller.current = requestController;
    const publish = (next: DirectoryState) => {
      if (active.current) { current.current = next; setState(next); }
    };
    publish({ status: "loading", users: [], error: "" });
    const request = Promise.resolve().then(async () => {
      const users = new Map<string, SelectableUser>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      try {
        while (active.current) {
          const page = await loadPage(cursor, requestController.signal);
          if (!active.current) return;
          for (const user of page.items) users.set(user.user_id, user);
          if (!page.next_cursor) {
            publish({ status: "ready", users: [...users.values()], error: "" });
            return;
          }
          if (cursors.has(page.next_cursor)) throw new Error("Repeated user cursor");
          cursors.add(page.next_cursor);
          cursor = page.next_cursor;
        }
      } catch (error) {
        publish({ status: "error", users: [], error: error instanceof ApiError
          ? error.message : "사용자 목록을 불러오지 못했습니다. 다시 시도해 주세요." });
      }
    }).finally(() => { pending.current = null; });
    pending.current = request;
    return request;
  }, [loadPage, userId]);
  const ensureLoaded = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);
  return <UserDirectoryContext.Provider value={{ ...state, ensureLoaded, refresh }}>{children}</UserDirectoryContext.Provider>;
}
