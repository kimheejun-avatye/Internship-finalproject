import { useState } from "react";
import ChatLayout from "../../../layouts/chat/ChatLayout";
import searchIcon from "../../../assets/chat-search.svg";
import ChatRoomRow from "../components/ChatRoomRow";
import type { ChatSnapshot } from "../chat.types";

// unreadSupported: 안 읽음 필터를 보여 줄지 (실제 API 모드에는 읽음 정보가 없다)
type Props = { state: ChatSnapshot; onOpen: (id: string) => void; footer: React.ReactNode; unreadSupported?: boolean };
export default function ChatRoomListView({ state, onOpen, footer, unreadSupported = true }: Props) {
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase();
  const needle = normalize(query.trim());
  const rooms = state.rooms.filter(room => (!unreadOnly || !!room.presentation?.unreadCount) && [room.display_title, ...room.members.map(m => m.name), ...(state.messages[room.chat_room_id] ?? []).map(m => m.message)].some(text => normalize(text).includes(needle))).sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at) || b.chat_room_id.localeCompare(a.chat_room_id));
  const unreadRooms = state.rooms.filter(room => room.presentation?.unreadCount).length;
  return <ChatLayout header={<div className="chat-panel-tools">
    <div className="chat-panel-search"><img src={searchIcon} width="17" height="17" alt="" /><input type="search" aria-label="이름 또는 대화 내용 검색" placeholder="이름 또는 대화 내용 검색" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="chat-panel-summary">{unreadSupported ? <div className="chat-room-filters" role="group" aria-label="채팅 목록 필터">
      <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>전체</button>
      <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>안 읽음 <span>{unreadRooms}</span></button>
    </div> : <span>전체 대화 <b>{state.rooms.length}</b></span>}<span className="chat-friend-order">최근 대화</span></div>
  </div>} footer={footer}>
    <div className="chat-panel-list">{rooms.length ? <ul className="chat-room-list" aria-label="채팅방 목록">{rooms.map(room => <ChatRoomRow key={room.chat_room_id} room={room} onOpen={() => onOpen(room.chat_room_id)} />)}</ul> : <p className="chat-panel-placeholder" role="status">{query ? "검색 결과가 없습니다." : unreadOnly ? "안 읽은 대화가 없습니다." : "아직 대화가 없습니다."}</p>}</div>
  </ChatLayout>;
}
