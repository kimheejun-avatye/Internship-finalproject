import { useState } from "react";
import ChatLayout from "../../../layouts/chat/ChatLayout";
import searchIcon from "../../../assets/chat-search.svg";
import FriendRow from "../components/FriendRow";
import { filterUsers } from "../filterUsers";
import type { ChatUser } from "../chat.types";

type Props = { users: ChatUser[]; onChooseUser: (id: string) => void; footer: React.ReactNode };
export default function FriendListView({ users, onChooseUser, footer }: Props) {
  const [query, setQuery] = useState("");
  const filtered = filterUsers(users, query);
  return <ChatLayout header={<div className="chat-panel-tools">
    <div className="chat-panel-search"><img src={searchIcon} width="17" height="17" alt="" /><input type="search" aria-label="이름 또는 팀 검색" placeholder="이름, 소속 또는 부서/직무 검색" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="chat-panel-summary"><span>전체 친구 <b>{users.length}</b></span><span className="chat-friend-order">{query ? "검색 결과 " + filtered.length + "명" : "이름순"}</span></div>
  </div>} footer={footer}>
    <div className="chat-panel-list">
      {filtered.length ? <ul className="chat-friend-list" aria-label="친구 목록">{filtered.map(user => <FriendRow key={user.user_id} user={user} onOpen={onChooseUser} />)}</ul> : <p role="status" className="chat-panel-placeholder">검색 결과가 없습니다.</p>}
    </div>
  </ChatLayout>;
}
