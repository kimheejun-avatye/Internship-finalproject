import calendarIcon from "../../../assets/memo-calendar.svg";
import doorIcon from "../../../assets/memo-door.svg";
import usersIcon from "../../../assets/memo-users.svg";
import linkIcon from "../../../assets/memo-link.svg";
import type { CalendarReservation } from "../../reservations/reservations.types";
import { seoulDay, seoulTime } from "../../reservations/reservation-time";

export default function MeetingNoteHeader({ meeting, savedAt, saving, onSave }: {
  meeting: CalendarReservation; savedAt: string | null; saving: boolean; onSave: () => void;
}) {
  const start = seoulDay(meeting.start_at);
  const end = seoulDay(meeting.end_at);
  return <header className="meeting-note-header">
    <div className="meeting-note-title"><h1>{meeting.title}</h1><span className="meeting-note-linked"><img src={linkIcon} alt="" />회의 이름과 연동</span></div>
    <p className="meeting-note-saved">{savedAt ? <>최근 저장 <time dateTime={savedAt}>{seoulDay(savedAt).replaceAll("-", ".")} {seoulTime(savedAt)}</time></> : "아직 저장하지 않았습니다."}</p>
    <div className="meeting-note-info">
      <span><img src={calendarIcon} alt="" />{start.replaceAll("-", ".")} {seoulTime(meeting.start_at)}–{start !== end ? `${end.replaceAll("-", ".")} ` : ""}{seoulTime(meeting.end_at)}</span>
      <span><img src={doorIcon} alt="" />{meeting.room_name}</span>
      <span><img src={usersIcon} alt="" />참여자 {meeting.participant_count}명</span>
    </div>
    <button type="button" className="meeting-note-save" disabled={saving} onClick={onSave}>{saving ? "저장 중…" : "저장"}</button>
  </header>;
}
