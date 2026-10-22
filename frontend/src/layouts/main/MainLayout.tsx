import { Outlet } from "react-router-dom";
import ChatPanel from "../../features/chat/ChatPanel";
import MainHeader from "./MainHeader";
import { useAuth } from "../../features/auth/AuthProvider";

export default function MainLayout() {
  const { session } = useAuth();
  return (
    <div className="app">
      <MainHeader />
      <div className="app-body">
        <main className="main">
          <Outlet />
        </main>
        <aside className="main-chat-slot" aria-label="채팅 영역">
          {session && <ChatPanel key={session.user.user_id} me={session.user} />}
        </aside>
      </div>
    </div>
  );
}
