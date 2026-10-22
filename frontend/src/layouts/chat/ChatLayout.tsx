import type { ReactNode, Ref } from "react";
import "./ChatLayout.css";

type ChatLayoutProps = {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
};

// 목록과 대화 화면이 같은 틀을 사용하며, 가운데 내용만 독립적으로 스크롤합니다.
export default function ChatLayout({ header, children, footer, bodyRef }: ChatLayoutProps) {
  return (
    <div className="chat-layout">
      <div className="chat-layout-header">{header}</div>
      <div ref={bodyRef} className="chat-layout-body">{children}</div>
      {footer && <div className="chat-layout-footer">{footer}</div>}
    </div>
  );
}
