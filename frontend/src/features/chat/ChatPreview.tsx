import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PreviewChatPanel from "./PreviewChatPanel";
import { getChatData } from "./chat.data";
import "../../styles/tokens.css";
import "../../styles/global.css";

// Standalone local review page. The main app receives account information from AuthProvider.
function ChatPreview() {
  return <div className="chat-preview-frame"><PreviewChatPanel data={getChatData("AVATYE")} /></div>;
}

createRoot(document.getElementById("chat-preview-root")!).render(<StrictMode><ChatPreview /></StrictMode>);
