import { useRef } from "react";
import sendIcon from "../../../assets/chat-send.svg";

type Props = { value: string; onChange: (value: string) => void; onSend: () => void };
export default function MessageComposer({ value, onChange, onSend }: Props) {
  const composing = useRef(false);
  const count = Array.from(value.trim()).length;
  const valid = count > 0 && count <= 2000;
  return <form className="chat-composer" onSubmit={event => { event.preventDefault(); if (valid && !composing.current) onSend(); }}>
    <textarea aria-label="메시지 입력" placeholder="메시지를 입력하세요." value={value} rows={2} onChange={e => onChange(e.target.value)}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onKeyDown={event => {
        if (event.key !== "Enter" || event.shiftKey || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        event.preventDefault(); if (valid) onSend();
      }} aria-invalid={count > 2000} aria-describedby="chat-message-length" />
    <div className="chat-composer-actions"><span id="chat-message-length" className={count > 2000 ? "chat-length-error" : ""} role={count > 2000 ? "alert" : undefined}>{count > 2000 ? "2,000자까지 입력할 수 있습니다." : count ? count.toLocaleString() + " / 2,000" : ""}</span><button type="submit" disabled={!valid}>전송 <img src={sendIcon} width="13" height="13" alt="" /></button></div>
  </form>;
}
