import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ChatPanel from "./ChatPanel";
import "../../styles/tokens.css";
import "../../styles/global.css";

// Standalone local review page. The main app receives account information from AuthProvider.
function ChatPreview() {
  return <div className="chat-preview-frame"><ChatPanel /></div>;
}

createRoot(document.getElementById("chat-preview-root")!).render(<StrictMode><ChatPreview /></StrictMode>);
