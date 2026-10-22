import { useRef } from "react";
import type { KeyboardEvent } from "react";
import composeIcon from "../../../assets/chat-compose.svg";
import type { ChatTab } from "../chat.types";

const tabs = [{ id: "friends", label: "친구" }, { id: "rooms", label: "채팅 목록" }] as const;
// roomCount: 채팅 목록 탭 숫자 (목업은 안 읽은 방 수, 실제 API 는 방 수)
type Props = { activeTab: ChatTab; friendCount: number; roomCount: number; onTab: (tab: ChatTab) => void; onCreate: () => void; panelId: string };
export default function ChatPanelHeader({ activeTab, friendCount, roomCount, onTab, onCreate, panelId }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : undefined;
    if (next === undefined) return;
    event.preventDefault(); onTab(tabs[next].id); refs.current[next]?.focus();
  }
  return <div className="chat-panel-header">
    <div className="chat-panel-titlebar">
      <h2>AVATYE 메신저</h2>
      <button type="button" className="chat-panel-compose" aria-label="새 채팅" onClick={onCreate}><img src={composeIcon} width="20" height="20" alt="" /></button>
    </div>
    <div className="chat-panel-tabs" role="tablist" aria-label="메신저 목록">
      {tabs.map((tab, index) => <button key={tab.id} ref={el => { refs.current[index] = el; }} type="button" role="tab" aria-label={tab.label} id={panelId + "-" + tab.id + "-tab"} aria-controls={panelId + "-" + tab.id + "-panel"} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className="chat-panel-tab" onClick={() => onTab(tab.id)} onKeyDown={event => move(event, index)}>
        <span className={"chat-panel-tab-icon chat-panel-tab-icon--" + tab.id} aria-hidden="true" />
        {tab.label}<span className="chat-tab-count" aria-hidden="true">{tab.id === "friends" ? friendCount : roomCount}</span>
      </button>)}
    </div>
  </div>;
}
