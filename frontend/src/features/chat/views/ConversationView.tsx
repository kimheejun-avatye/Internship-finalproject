import { Fragment, useLayoutEffect, useRef, useState } from "react";
import ChatLayout from "../../../layouts/chat/ChatLayout";
import backIcon from "../../../assets/chat-arrow-left.svg";
import moreIcon from "../../../assets/chat-more.svg";
import MessageBubble, { formatChatDate } from "../components/MessageBubble";
import MessageComposer from "../components/MessageComposer";
import type { ChatData, ChatRoom, ChatSnapshot } from "../chat.types";

type Props = { state: ChatSnapshot; room: ChatRoom; data: ChatData; onBack: () => void };
export default function ConversationView({ state, room, data, onBack }: Props) {
  const [visibleCount, setVisibleCount] = useState(8);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const prependPosition = useRef<{ height: number; top: number } | null>(null);
  // 실제 API 모드에서 아직 불러오지 않은 방은 undefined
  const loaded = state.messages[room.chat_room_id];
  const all = loaded ?? [];
  const messages = all.slice(-visibleCount);
  const lastId = all.at(-1)?.message_id;
  const hasOlder = all.length > visibleCount || !!state.history?.[room.chat_room_id];
  const person = state.users.find(u => u.user_id === room.members[0]?.user_id);
  const group = room.type === "GROUP";
  // 새 메시지가 오면 맨 아래로, 이전 메시지를 펼치면 보던 위치를 유지한다.
  // 서버에서 이전 메시지를 받아도 마지막 메시지는 그대로라 스크롤이 튀지 않는다
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (prependPosition.current) {
      body.scrollTop = prependPosition.current.top + body.scrollHeight - prependPosition.current.height;
      prependPosition.current = null;
    } else body.scrollTop = body.scrollHeight;
  }, [lastId, visibleCount]);
  async function loadOlder() {
    // 메모리에 더 보여줄 메시지가 없으면 서버에서 이전 페이지를 받는다
    if (all.length <= visibleCount && data.loadOlder) {
      try { await data.loadOlder(room.chat_room_id); } catch (e) { setError(e instanceof Error ? e.message : "이전 메시지를 불러오지 못했습니다."); return; }
    }
    const body = bodyRef.current;
    if (body) prependPosition.current = { height: body.scrollHeight, top: body.scrollTop };
    setVisibleCount(count => count + 8);
  }
  return <ChatLayout bodyRef={bodyRef} header={<div className="chat-conversation-header">
    <button type="button" className="chat-icon-button" aria-label="이전 목록으로 돌아가기" onClick={onBack}><img src={backIcon} width="19" height="19" alt="" /></button>
    <div className="chat-conversation-person"><div><h3>{room.display_title}</h3>{group ? <span>{room.member_count}명</span> : person?.online !== undefined && <span className={person.online ? "chat-online" : ""}>{person.online ? "접속 중" : "오프라인"}</span>}</div>
      <p>{group ? [state.me.name, ...room.members.map(m => m.name)].join(" · ") : person?.profile}</p>
    </div>
    <button type="button" className="chat-icon-button" aria-label="더보기 (준비 중)" disabled><img src={moreIcon} width="18" height="18" alt="" /></button>
  </div>} footer={<div className="chat-conversation-footer">{error && <p role="alert" className="form-error">{error}</p>}<MessageComposer value={state.drafts[room.chat_room_id] ?? ""} onChange={value => data.setDraft(room.chat_room_id, value)} onSend={async () => {
    try { setError(""); await data.sendMessage(room.chat_room_id, state.drafts[room.chat_room_id] ?? ""); } catch (e) { setError(e instanceof Error ? e.message : "메시지를 보내지 못했습니다."); }
  }} /></div>}>
    <section className="chat-messages" aria-label="대화 내역" tabIndex={0}>
      {hasOlder && <button type="button" className="chat-load-older" onClick={loadOlder}>이전 메시지 보기</button>}
      {!loaded && <p className="chat-panel-placeholder" role="status">대화를 불러오는 중입니다.</p>}
      {loaded && !all.length && <p className="chat-panel-placeholder">아직 메시지가 없습니다.<br />첫 메시지를 보내보세요.</p>}
      {messages.map((message, index) => <Fragment key={message.message_id}>
        {(index === 0 || formatChatDate(messages[index - 1].created_at) !== formatChatDate(message.created_at)) && <p className="chat-date-separator">{formatChatDate(message.created_at)}</p>}
        <MessageBubble message={message} own={message.user_id === state.me.user_id} group={group} />
      </Fragment>)}
    </section>
  </ChatLayout>;
}
