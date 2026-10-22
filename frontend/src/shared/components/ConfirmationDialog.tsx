import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./confirmation-dialog.css";

type Props = {
  title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string;
  busy?: boolean; error?: string; onConfirm: () => void; onCancel: () => void;
};

export default function ConfirmationDialog({ title, children, confirmLabel, cancelLabel = "취소", busy = false, error, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(<dialog ref={ref} className="confirmation-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={titleId}>{title}</h2>
    <div className="confirmation-dialog-content">{children}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="confirmation-dialog-actions">
      <button type="button" autoFocus disabled={busy} onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className="confirm" disabled={busy} onClick={onConfirm}>{busy ? "처리 중…" : confirmLabel}</button>
    </div>
  </dialog>, document.body);
}
