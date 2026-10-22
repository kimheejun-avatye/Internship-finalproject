import type { ChatData, Team } from "./chat.types";
import { createMockChat } from "./mocks/chat.mock";

// Deliberately no HTTP/session-client import: mock IDs never reach the server.
// Each organization has its own preview self, rooms and drafts. Memory survives route changes.
const previews = new Map<Team, ChatData>();
export function getChatData(team: Team): ChatData {
  let data = previews.get(team);
  if (!data) { data = createMockChat(team); previews.set(team, data); }
  return data;
}
