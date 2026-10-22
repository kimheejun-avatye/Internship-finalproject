import type { ChatData, ChatUser, Team } from "./chat.types";
import { createLiveChat } from "./chat.live";
import { createMockChat } from "./mocks/chat.mock";

// 목업: 백엔드 없이 화면만 확인하는 미리보기(chat-preview.html)와 테스트용. mock ID 는 서버로 가지 않는다.
// Each organization has its own preview self, rooms and drafts. Memory survives route changes.
const previews = new Map<Team, ChatData>();
export function getChatData(team: Team): ChatData {
  let data = previews.get(team);
  if (!data) { data = createMockChat(team); previews.set(team, data); }
  return data;
}

// 실제 API: 로그인한 사용자마다 하나. 다른 사용자로 바뀌면 이전 연결을 닫고 새로 만든다
let live: { userId: string; data: ChatData } | null = null;
export function getLiveChatData(me: ChatUser): ChatData {
  if (live?.userId !== me.user_id) {
    live?.data.disconnect?.();
    live = { userId: me.user_id, data: createLiveChat(me) };
  }
  return live.data;
}
