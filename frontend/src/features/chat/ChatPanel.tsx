import { useEffect, useId, useRef, useState } from "react";
import messageHintIcon from "../../assets/chat-message-hint.svg";
import { useSelectableUsers } from "../../shared/hooks/useSelectableUsers";
import ChatPanelHeader from "./components/ChatPanelHeader";
import CreateChatRoomView from "./views/CreateChatRoomView";
import FriendListView from "./views/FriendListView";
import ChatRoomListView from "./views/ChatRoomListView";
import ConversationView from "./views/ConversationView";
import { getChatData, getLiveChatData } from "./chat.data";
import { useChatState } from "./hooks/useChatState";
import type { ChatData, ChatTab, ChatUser, Team } from "./chat.types";
import "./chat.css";

// me 가 있으면(로그인 상태) 백엔드와 연결하고, 없으면 미리보기용 목업을 쓴다
export default function ChatPanel({ team = "AVATYE", me, data: providedData }: { team?: Team; me?: ChatUser; data?: ChatData }) {
  const data = providedData ?? (me ? getLiveChatData(me) : getChatData(team));
  const state = useChatState(data);
  const directory = useSelectableUsers({ enabled: false });
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
  // 패널이 화면에 있는 동안만 실시간 연결을 유지한다
  useEffect(() => {
    data.connect?.();
    return () => data.disconnect?.();
  }, [data]);
  const footer = <p className="chat-panel-hint"><img src={messageHintIcon} width="16" height="16" alt="" />대화를 선택해 메시지를 주고받으세요.</p>;
  const room = screen.kind === "conversation" ? state.rooms.find(r => r.chat_room_id === screen.roomId) : undefined;
  const shownError = error || state.error;
  // 읽음 정보는 백엔드에 없어 실제 API 모드에서는 안 읽음 표시 대신 방 수를 보여 준다
  const unreadSupported = data.mode === "mock";
  const roomCount = unreadSupported ? state.rooms.filter(r => r.presentation?.unreadCount).length : state.rooms.length;
  return <div ref={root} className="chat-panel">
    {screen.kind === "create" ? <CreateChatRoomView onBack={() => data.cancelCreate()} onCreate={async (ids, title) => {
      const id = await data.createRoom(ids, title);
      const origin = state.beforeCreate.kind === "conversation" ? state.beforeCreate.origin : state.beforeCreate.kind;
      data.openRoom(id, origin);
    }} /> : <>
      <ChatPanelHeader activeTab={activeTab} friendCount={directory.users.length} roomCount={roomCount} panelId={panelId} onCreate={() => { setError(""); data.navigate({ kind: "create" }); }} onTab={tab => { setError(""); data.navigate({ kind: tab }); }} />
      {shownError && <p role="alert" className="chat-panel-error">{shownError}</p>}
      {(["friends", "rooms"] as const).map(tab => <div key={tab} role="tabpanel" id={panelId + "-" + tab + "-panel"} aria-labelledby={panelId + "-" + tab + "-tab"} hidden={activeTab !== tab} className="chat-panel-content">
        {tab === activeTab && (screen.kind === "friends" ? <FriendListView preview footer={footer} onChooseUser={async id => {
          try { setError(""); data.openRoom(await data.createRoom([id]), "friends"); } catch (e) { setError(e instanceof Error ? e.message : "대화를 열지 못했습니다."); }
        }} /> : screen.kind === "conversation" && room ? <ConversationView key={room.chat_room_id} room={room} state={state} data={data} onBack={() => data.navigate({ kind: screen.origin })} /> : <ChatRoomListView state={state} footer={footer} unreadSupported={unreadSupported} onOpen={id => data.openRoom(id, "rooms")} />)}
      </div>)}
    </>}
  </div>;
}
