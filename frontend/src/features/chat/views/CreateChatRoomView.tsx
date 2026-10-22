import { useEffect, useRef, useState } from "react";
import ChatLayout from "../../../layouts/chat/ChatLayout";
import backIcon from "../../../assets/chat-back.svg";
import UserPicker from "../../../shared/users/UserPicker";
import { useSelectableUsers } from "../../../shared/hooks/useSelectableUsers";

type Props = { onBack: () => void; onCreate?: (ids: string[], title: string) => void | Promise<void>; excludedIds?: string[] };
export default function CreateChatRoomView({ onBack, onCreate, excludedIds }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const directory = useSelectableUsers({ enabled: false });
  useEffect(() => { heading.current?.focus(); }, []);
  async function create() {
    if (creating.current || !onCreate || directory.status !== "ready" || !selectedIds.length) return;
    creating.current = true; setBusy(true); setError("");
    try { await onCreate(selectedIds, title); } catch (e) { setError(e instanceof Error ? e.message : "채팅을 시작하지 못했습니다."); }
    finally { creating.current = false; setBusy(false); }
  }
  return <UserPicker selectionMode="multiple" appearance="panel" selectedIds={selectedIds} excludedIds={excludedIds}
    disabled={busy} onChange={setSelectedIds} listLabel="친구 선택 목록">
    {({ search, summary, selection, results }) => <ChatLayout header={<div className="chat-create-header">
      <div className="chat-create-titlebar"><button type="button" className="chat-create-back" aria-label="메신저 목록으로 돌아가기" onClick={onBack}><img src={backIcon} width="40" height="40" alt="" /></button><h2 ref={heading} tabIndex={-1}>새 채팅방</h2></div>
      <label className="chat-create-search-label" htmlFor="chat-room-name">채팅방 이름 <span>(선택)</span></label>
      <input id="chat-room-name" className="chat-room-name" placeholder="채팅방 이름을 입력하세요." maxLength={50} value={title} disabled={busy || selectedIds.length === 1} onChange={e => setTitle(e.target.value)} aria-describedby="chat-title-hint" />
      <p id="chat-title-hint" className="chat-input-hint">{selectedIds.length === 1 ? "1명 선택 시 개인 대화로 시작하며 이름은 적용되지 않아요." : "입력하지 않으면 참여자 이름으로 자동 생성됩니다. (최대 50자)"}</p>
      <div className="chat-create-people"><p className="chat-create-search-label">친구 선택</p>{search}<div className="chat-create-summary">{summary}</div>{selection}</div>
    </div>} footer={<div className="chat-create-footer">
      {error && <p role="alert" className="form-error">{error}</p>}
      {!onCreate && <p className="chat-input-hint">사용자 검색·선택이 가능합니다. 채팅방 생성 기능은 연결 준비 중입니다.</p>}
      <button type="button" className="chat-start-button" disabled={busy || !onCreate || !selectedIds.length || directory.status !== "ready"} onClick={create}>
        {onCreate ? `${selectedIds.length}명과 채팅 시작` : "채팅 연결 준비 중"}
      </button>
    </div>}><div className="chat-create-results">{results}</div></ChatLayout>}
  </UserPicker>;
}
