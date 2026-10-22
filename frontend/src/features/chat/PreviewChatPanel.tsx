import { useMemo } from "react";
import { UserDirectoryProvider } from "../../shared/users/UserDirectoryProvider";
import ChatPanel from "./ChatPanel";
import type { ChatData } from "./chat.types";

export default function PreviewChatPanel({ data }: { data: ChatData }) {
  const loadPage = useMemo(() => async () => ({ items: data.getSnapshot().users, next_cursor: null }), [data]);
  return <UserDirectoryProvider userId={data.getSnapshot().me.user_id} loadPage={loadPage}><ChatPanel data={data} /></UserDirectoryProvider>;
}
