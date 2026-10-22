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
  const all = state.messages[room.chat_room_id];
  const messages = all.slice(-visibleCount);
  const person = state.users.find(u => u.user_id === room.members[0]?.user_id);
  const group = room.type === "GROUP";
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (prependPosition.current) {
      body.scrollTop = prependPosition.current.top + body.scrollHeight - prependPosition.current.height;
      prependPosition.current = null;
    } else body.scrollTop = body.scrollHeight;
  }, [all.length, visibleCount]);
  function loadOlder() {
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
  </div>} footer={<div className="chat-conversation-footer">{error && <p role="alert" className="form-error">{error}</p>}<MessageComposer value={state.drafts[room.chat_room_id] ?? ""} onChange={value => data.setDraft(room.chat_room_id, value)} onSend={() => {
    try { data.sendMessage(room.chat_room_id, state.drafts[room.chat_room_id] ?? ""); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "메시지를 보내지 못했습니다."); }
  }} /></div>}>
    <section className="chat-messages" aria-label="대화 내역" tabIndex={0}>
      {all.length > visibleCount && <button type="button" className="chat-load-older" onClick={loadOlder}>이전 메시지 보기</button>}
      {!all.length && <p className="chat-panel-placeholder">아직 메시지가 없습니다.<br />첫 메시지를 보내보세요.</p>}
      {messages.map((message, index) => <Fragment key={message.message_id}>
        {(index === 0 || formatChatDate(messages[index - 1].created_at) !== formatChatDate(message.created_at)) && <p className="chat-date-separator">{formatChatDate(message.created_at)}</p>}
        <MessageBubble message={message} own={message.user_id === state.me.user_id} group={group} />
      </Fragment>)}
    </section>
  </ChatLayout>;
}
