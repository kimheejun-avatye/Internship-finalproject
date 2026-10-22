import { useId, useState } from "react";
import UserPicker from "../../../shared/users/UserPicker";

type Props = { selected: string[]; onChange: (ids: string[]) => void; capacity?: number; disabled?: boolean; busyIds?: ReadonlySet<string> };

const NO_BUSY: ReadonlySet<string> = new Set();

export default function AttendeePicker({ selected, onChange, capacity, disabled = false, busyIds = NO_BUSY }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = new Set(selected).size + 1;
  const overCapacity = capacity !== undefined && count > capacity;
  const hasBusySelected = selected.some(id => busyIds.has(id));
  const warn = overCapacity || hasBusySelected;
  return <div className="attendee-picker">
    <span className="reservation-field-label" id={`${panelId}-label`}>참여자</span>
    <button className="attendee-picker-trigger" type="button" disabled={disabled} aria-labelledby={`${panelId}-label ${panelId}-value`}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span id={`${panelId}-value`}>{selected.length ? `참석자 ${selected.length}명 선택` : "참석자 선택"}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <section className="attendee-picker-popover" id={panelId} aria-label="참석자 선택 목록" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
      <UserPicker selectionMode="multiple" selectedIds={selected} onChange={onChange} disabled={disabled} listLabel="참석자 목록" unavailableIds={busyIds} unavailableLabel="다른 회의 있음">
        {({ search, results, selection }) => <>
          <div className="attendee-picker-search">{search}<button type="button" className="attendee-picker-close" onClick={() => setOpen(false)}>닫기</button></div>
          {results}{selection}
        </>}
      </UserPicker>
      <p className={warn ? "reservation-capacity-warning" : "attendee-picker-count"}>
        예약자 포함 {count}명{capacity !== undefined ? ` / 정원 ${capacity}명` : ""}{overCapacity ? " · 회의실 정원을 초과했습니다." : ""}{hasBusySelected ? " · 일정이 겹치는 참석자가 있습니다." : ""}
      </p>
    </section>}
    {!open && <span className={warn ? "reservation-capacity-warning" : "reservation-field-hint"}>
      예약자 포함 {count}명{capacity !== undefined ? ` / ${capacity}명` : ""}{overCapacity ? " · 정원 초과" : ""}{hasBusySelected ? " · 일정 겹침" : ""}
    </span>}
  </div>;
}
