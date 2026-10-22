import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { getSelectableUsersPage, type SelectableUser } from "../api/users";

type UserDirectory = {
  status: "loading" | "ready" | "error";
  users: SelectableUser[];
  error: string;
};

export function useSelectableUsers() {
  const [attempt, setAttempt] = useState(0);
  const [directory, setDirectory] = useState<UserDirectory>({ status: "loading", users: [], error: "" });

  useEffect(() => {
    let active = true;
    setDirectory({ status: "loading", users: [], error: "" });

    async function load() {
      const users = new Map<string, SelectableUser>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      try {
        while (active) {
          const page = await getSelectableUsersPage(cursor);
          if (!active) return;
          for (const user of page.items) users.set(user.user_id, user);
          if (!page.next_cursor) {
            // 전체 페이지를 받은 뒤 한 번에 공개해 부분 목록을 전체로 오인하지 않게 합니다.
            setDirectory({ status: "ready", users: [...users.values()], error: "" });
            return;
          }
          if (cursors.has(page.next_cursor)) throw new Error("Repeated user cursor");
          cursors.add(page.next_cursor);
          cursor = page.next_cursor;
        }
      } catch (error) {
        if (active) setDirectory({
          status: "error", users: [],
          error: error instanceof ApiError ? error.message : "사용자 목록을 불러오지 못했습니다. 다시 시도해 주세요.",
        });
      }
    }

    // StrictMode의 즉시 정리되는 첫 effect에서는 요청을 시작하지 않습니다.
    void Promise.resolve().then(() => { if (active) return load(); });
    return () => { active = false; };
  }, [attempt]);

  function retry() {
    setDirectory({ status: "loading", users: [], error: "" });
    setAttempt(value => value + 1);
  }

  return { ...directory, retry };
}
