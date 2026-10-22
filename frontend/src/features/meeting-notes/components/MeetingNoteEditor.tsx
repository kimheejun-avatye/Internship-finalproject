export default function MeetingNoteEditor({ value, onChange, saving }: { value: string; onChange: (value: string) => void; saving: boolean }) {
  return <textarea className="meeting-note-editor" aria-label="내 회의록" aria-describedby="meeting-note-description" value={value}
    readOnly={saving} placeholder="회의 내용을 기록해 주세요." onChange={event => onChange(event.target.value)} />;
}
