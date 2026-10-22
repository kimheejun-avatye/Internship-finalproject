import { request } from "./session-client";

export interface SelectableUser {
  user_id: string;
  name: string;
  email: string;
  team: "AVATYE" | "GURU";
}

interface UserPage {
  items: SelectableUser[];
  next_cursor: string | null;
}

// 검색어는 보내지 않고 선택 가능한 사용자 목록을 50명씩 읽습니다.
export function getSelectableUsersPage(cursor?: string) {
  const params = new URLSearchParams({ q: "", limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return request<UserPage>(`/api/users/search?${params}`);
}
