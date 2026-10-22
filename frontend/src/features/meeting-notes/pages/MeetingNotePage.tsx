import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBeforeUnload, useBlocker, useParams, useSearchParams } from "react-router-dom";
import { getCalendarReservations } from "../../reservations/reservations.api";
import type { CalendarReservation } from "../../reservations/reservations.types";
import { addDays, boundary, isValidDay, seoulDay } from "../../reservations/reservation-time";
import ConfirmationDialog from "../../../shared/components/ConfirmationDialog";
import { getMeetingNote, saveMeetingNote } from "../meeting-notes.api";
import MeetingNoteHeader from "../components/MeetingNoteHeader";
import MeetingNoteEditor from "../components/MeetingNoteEditor";
import "../meeting-notes.css";

// 예약이 달라지면 편집 상태도 새로 시작한다.
export default function MeetingNotePage() {
  const { reservationId = "" } = useParams();
  return <MeetingNote key={reservationId} reservationId={reservationId} />;
}

function MeetingNote({ reservationId }: { reservationId: string }) {
  const [params] = useSearchParams();
  const day = params.get("date") || "";
  const returnDay = params.get("calendar_date") || day;
  const backQuery = new URLSearchParams({
    date: isValidDay(returnDay) ? returnDay : seoulDay(),
    view: params.get("view") === "month" ? "month" : "week",
    scope: params.get("scope") === "mine" ? "mine" : "all",
  });
  if (params.get("room_id")) backQuery.set("room_id", params.get("room_id")!);
  const [meeting, setMeeting] = useState<CalendarReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const dirty = draft !== saved;
  const blocker = useBlocker(dirty || saving);
  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (dirty || pending.current) { event.preventDefault(); event.returnValue = ""; }
  }, [dirty]));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        if (!isValidDay(day)) throw new Error("예약 날짜가 없습니다. 캘린더에서 회의록을 다시 열어 주세요.");
        const [items, note] = await Promise.all([
          getCalendarReservations({ start_at: boundary(day), end_at: boundary(addDays(day, 1)), scope: "all" }, controller.signal),
          getMeetingNote(reservationId, controller.signal),
        ]);
        if (!active) return;
        const item = items.find(item => item.reservation_id === reservationId);
        if (!item) throw new Error("해당 날짜의 예약을 찾을 수 없습니다. 캘린더에서 다시 확인해 주세요.");
        setMeeting(item);
        setDraft(note?.memo ?? "");
        setSaved(note?.memo ?? "");
        setSavedAt(note?.updated_at ?? note?.created_at ?? null);
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : "회의록을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [reservationId, day, retry]);

  async function save() {
    if (pending.current || !meeting || loading) return;
    pending.current = true;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const note = await saveMeetingNote(reservationId, draft);
      if (!mounted.current) return;
      setSaved(note.memo ?? "");
      setDraft(note.memo ?? "");
      setSavedAt(note.updated_at ?? note.created_at);
      setNotice("회의록을 저장했습니다.");
    } catch (err) {
      if (mounted.current) setSaveError(err instanceof Error ? err.message : "저장하지 못했습니다. 작성 내용은 유지됩니다.");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <section className="meeting-note-page" aria-label="개인 회의록">
    <Link className="meeting-note-back" to={`/calendar?${backQuery}`}>← 캘린더로 돌아가기</Link>
    {loading && <p role="status">회의록을 불러오는 중입니다.</p>}
    {loadError && <p role="alert" className="form-error">{loadError} <button type="button" onClick={() => setRetry(value => value + 1)}>다시 조회</button></p>}
    {!loading && !loadError && meeting && <>
      <MeetingNoteHeader meeting={meeting} savedAt={savedAt} saving={saving} onSave={() => void save()} />
      <p id="meeting-note-description" className="meeting-note-description">본인만 조회하고 작성하는 개인 회의록입니다.{dirty && " · 저장하지 않은 변경 사항이 있습니다."}</p>
      {saveError && <p role="alert" className="form-error">{saveError}</p>}
      {notice && <p role="status" className="meeting-note-notice">{notice}</p>}
      <MeetingNoteEditor value={draft} saving={saving} onChange={value => { setDraft(value); setNotice(""); }} />
    </>}
    {blocker.state === "blocked" && <ConfirmationDialog title={saving ? "회의록 저장 중입니다" : "저장하지 않고 이동할까요?"}
      confirmLabel="이동" cancelLabel="계속 작성" busy={saving} onConfirm={() => blocker.proceed()} onCancel={() => blocker.reset()}>
      <p>{saving ? "저장이 끝난 뒤 이동해 주세요." : dirty ? "저장하지 않은 회의록 내용이 사라집니다." : "회의록이 저장되었습니다. 이동할 수 있습니다."}</p>
    </ConfirmationDialog>}
  </section>;
}
