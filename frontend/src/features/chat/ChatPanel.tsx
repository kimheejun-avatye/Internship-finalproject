import { useEffect, useId, useRef, useState } from "react";
import messageHintIcon from "../../assets/chat-message-hint.svg";
import ChatPanelHeader from "./components/ChatPanelHeader";
import CreateChatRoomView from "./views/CreateChatRoomView";
import FriendListView from "./views/FriendListView";
import ChatRoomListView from "./views/ChatRoomListView";
import ConversationView from "./views/ConversationView";
import { getChatData } from "./chat.data";
import { useChatState } from "./hooks/useChatState";
import type { ChatData, ChatTab, Team } from "./chat.types";
import "./chat.css";

export default function ChatPanel({ team = "AVATYE", data: providedData }: { team?: Team; data?: ChatData }) {
  const data = providedData ?? getChatData(team);
  const state = useChatState(data);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const wasCreate = useRef(false);
  const [error, setError] = useState("");
  const { screen } = state;
  const activeTab: ChatTab = screen.kind === "friends" ? "friends" : "rooms";
  useEffect(() => {
    if (wasCreate.current && screen.kind !== "create") root.current?.querySelector<HTMLButtonElement>('[aria-label="새 채팅"]')?.focus();
    wasCreate.current = screen.kind === "create";
  }, [screen.kind]);
  const footer = <p className="chat-panel-hint"><img src={messageHintIcon} width="16" height="16" alt="" />대화를 선택해 메시지를 주고받으세요.</p>;
  const room = screen.kind === "conversation" ? state.rooms.find(r => r.chat_room_id === screen.roomId) : undefined;
  return <div ref={root} className="chat-panel">
    {screen.kind === "create" ? <CreateChatRoomView users={state.users} onBack={() => data.cancelCreate()} onCreate={(ids, title) => {
      const id = data.createRoom(ids, title);
      const origin = state.beforeCreate.kind === "conversation" ? state.beforeCreate.origin : state.beforeCreate.kind;
      data.openRoom(id, origin);
    }} /> : <>
      <ChatPanelHeader activeTab={activeTab} friendCount={state.users.length} unreadCount={state.rooms.filter(r => r.presentation?.unreadCount).length} panelId={panelId} onCreate={() => { setError(""); data.navigate({ kind: "create" }); }} onTab={tab => { setError(""); data.navigate({ kind: tab }); }} />
      {error && <p role="alert" className="chat-panel-error">{error}</p>}
      {(["friends", "rooms"] as const).map(tab => <div key={tab} role="tabpanel" id={panelId + "-" + tab + "-panel"} aria-labelledby={panelId + "-" + tab + "-tab"} hidden={activeTab !== tab} className="chat-panel-content">
        {tab === activeTab && (screen.kind === "friends" ? <FriendListView users={state.users} footer={footer} onChooseUser={id => {
          try { data.openRoom(data.createRoom([id]), "friends"); } catch (e) { setError(e instanceof Error ? e.message : "대화를 열지 못했습니다."); }
        }} /> : screen.kind === "conversation" && room ? <ConversationView key={room.chat_room_id} room={room} state={state} data={data} onBack={() => data.navigate({ kind: screen.origin })} /> : <ChatRoomListView state={state} footer={footer} onOpen={id => data.openRoom(id, "rooms")} />)}
      </div>)}
    </>}
  </div>;
}
