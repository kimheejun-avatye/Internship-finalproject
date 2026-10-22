import { useEffect, useRef, useState } from "react";
import ChatLayout from "../../../layouts/chat/ChatLayout";
import backIcon from "../../../assets/chat-back.svg";
import searchIcon from "../../../assets/chat-search.svg";
import FriendRow from "../components/FriendRow";
import { filterUsers } from "../filterUsers";
import type { ChatUser } from "../chat.types";

type Props = { users: ChatUser[]; onBack: () => void; onCreate: (ids: string[], title: string) => Promise<void> };
export default function CreateChatRoomView({ users, onBack, onCreate }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  // 서버 응답을 기다리는 동안 같은 방을 두 번 만들지 않게 막는다
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const selected = users.filter(u => selectedIds.includes(u.user_id));
  const filtered = filterUsers(users, query);
  const toggle = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  async function create() {
    setBusy(true);
    try { await onCreate(selectedIds, title); } catch (e) { setError(e instanceof Error ? e.message : "채팅을 시작하지 못했습니다."); setBusy(false); }
  }
  return <ChatLayout header={<div className="chat-create-header">
    <div className="chat-create-titlebar"><button type="button" className="chat-create-back" aria-label="메신저 목록으로 돌아가기" onClick={onBack}><img src={backIcon} width="40" height="40" alt="" /></button><h2 ref={heading} tabIndex={-1}>새 채팅방</h2></div>
    <label className="chat-create-search-label" htmlFor="chat-room-name">채팅방 이름 <span>(선택)</span></label>
    <input id="chat-room-name" className="chat-room-name" placeholder="채팅방 이름을 입력하세요." maxLength={50} value={title} disabled={selected.length === 1} onChange={e => setTitle(e.target.value)} aria-describedby="chat-title-hint" />
    <p id="chat-title-hint" className="chat-input-hint">{selected.length === 1 ? "1명 선택 시 개인 대화로 시작하며 이름은 적용되지 않아요." : "입력하지 않으면 참여자 이름으로 자동 생성됩니다. (최대 50자)"}</p>
    <div className="chat-create-people">
      <label className="chat-create-search-label" htmlFor="chat-user-search">친구 선택</label>
      <div className="chat-panel-search"><img src={searchIcon} width="17" height="17" alt="" /><input id="chat-user-search" type="search" aria-label="이름 또는 팀 검색" placeholder="이름, 소속 또는 부서/직무 검색" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="chat-create-summary"><strong>선택한 친구 {selected.length}명</strong><span>{query ? "검색 " + filtered.length + "명" : "전체 " + users.length + "명"}</span></div>
      {selected.length > 0 && <ul className="chat-selected-users" aria-label="선택한 친구">{selected.map(user => <li key={user.user_id}><button type="button" aria-label={user.name + " (" + user.email + ") 선택 해제"} onClick={() => toggle(user.user_id)}>{user.name}<span aria-hidden="true">×</span></button></li>)}</ul>}
    </div>
  </div>} footer={<div className="chat-create-footer">{error && <p role="alert" className="form-error">{error}</p>}<button type="button" className="chat-start-button" disabled={!selected.length || busy} onClick={create}>{selected.length}명과 채팅 시작</button></div>}>
    <div className="chat-create-results">{filtered.length ? <ul className="chat-user-list" aria-label="친구 선택 목록">{filtered.map(user => <FriendRow key={user.user_id} user={user} selected={selectedIds.includes(user.user_id)} onToggle={toggle} />)}</ul> : <p className="chat-panel-placeholder" role="status">검색 결과가 없습니다.</p>}</div>
  </ChatLayout>;
}
