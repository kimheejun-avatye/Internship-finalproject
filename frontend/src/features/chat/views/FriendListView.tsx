import { useState, type ReactNode } from "react";
import ChatLayout from "../../../layouts/chat/ChatLayout";
import UserPicker from "../../../shared/users/UserPicker";

type Props = { onChooseUser: (id: string) => void; footer: ReactNode; preview?: boolean };
export default function FriendListView({ onChooseUser, footer, preview = false }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  return <UserPicker selectionMode="single" appearance="panel" selectedIds={selectedIds} listLabel="친구 목록"
    singleActionLabel={preview ? "대화 열기" : "선택"} onChange={ids => { setSelectedIds(ids); if (ids[0]) onChooseUser(ids[0]); }}>
    {({ search, summary, results }) => <ChatLayout header={<div className="chat-panel-tools">{search}{summary}</div>} footer={footer}>
      <div className="chat-panel-list">{results}</div>
    </ChatLayout>}
  </UserPicker>;
}
