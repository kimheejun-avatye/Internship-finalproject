import { useId, useState } from "react";
import { useSelectableUsers } from "../../../shared/hooks/useSelectableUsers";

type Props = { selected: string[]; onChange: (ids: string[]) => void; capacity?: number; disabled?: boolean; busyIds?: ReadonlySet<string> };

const NO_BUSY: ReadonlySet<string> = new Set();

export default function AttendeePicker({ selected, onChange, capacity, disabled = false, busyIds = NO_BUSY }: Props) {
  const directory = useSelectableUsers();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const needle = query.trim().toLocaleLowerCase();
  const visible = directory.users.filter(user => [user.name, user.email, user.team].some(value => value.toLocaleLowerCase().includes(needle)));
  const count = new Set(selected).size + 1;
  const overCapacity = capacity !== undefined && count > capacity;
  // 선택한 시간에 다른 회의가 있는 사람은 새로 고를 수 없다. 이미 고른 사람은 해제할 수 있게 남긴다.
  const hasBusySelected = selected.some(id => busyIds.has(id));
  const warn = overCapacity || hasBusySelected;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...new Set([...selected, id])]);
  }

  return <div className="attendee-picker">
    <span className="reservation-field-label" id={`${panelId}-label`}>참여자</span>
    <button className="attendee-picker-trigger" type="button" disabled={disabled} aria-labelledby={`${panelId}-label ${panelId}-value`}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span id={`${panelId}-value`}>{selected.length ? `참석자 ${selected.length}명 선택` : "참석자 선택"}</span>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <section className="attendee-picker-popover" id={panelId} aria-label="참석자 선택 목록" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
      <div className="attendee-picker-search">
        <input type="search" aria-label="참석자 이름·이메일·소속 검색" placeholder="이름, 이메일 또는 소속 검색" value={query}
          disabled={disabled} onChange={event => setQuery(event.target.value)} />
        <button type="button" className="attendee-picker-close" onClick={() => setOpen(false)}>닫기</button>
      </div>
      {directory.status === "loading" && <p role="status">사용자 목록을 불러오는 중입니다.</p>}
      {directory.status === "error" && <div role="alert"><p>{directory.error}</p><button type="button" onClick={directory.retry}>참석자 다시 조회</button></div>}
      {directory.status === "ready" && <>
        <div className="attendee-picker-results">
          {visible.map(user => {
            const busy = busyIds.has(user.user_id), chosen = selected.includes(user.user_id);
            return <label className={`attendee-picker-option${busy ? " busy" : ""}`} key={user.user_id}>
              <input type="checkbox" checked={chosen} disabled={disabled || (busy && !chosen)} onChange={() => toggle(user.user_id)} />
              <span><strong>{user.name}</strong><small>{user.email} · {user.team}{busy ? " · 다른 회의 있음" : ""}</small></span>
            </label>;
          })}
          {visible.length === 0 && <p>검색 결과가 없습니다.</p>}
        </div>
        {selected.length > 0 && <div className="attendee-picker-selected" aria-label="선택한 참석자">
          {selected.map(id => <button key={id} type="button" disabled={disabled} onClick={() => toggle(id)} aria-label={`${directory.users.find(user => user.user_id === id)?.name ?? "참석자"} 선택 해제`}>
            {directory.users.find(user => user.user_id === id)?.name ?? "참석자"}{busyIds.has(id) ? " (일정 겹침)" : ""}<span aria-hidden="true"> ×</span>
          </button>)}
        </div>}
      </>}
      <p className={warn ? "reservation-capacity-warning" : "attendee-picker-count"}>
        예약자 포함 {count}명{capacity !== undefined ? ` / 정원 ${capacity}명` : ""}{overCapacity ? " · 회의실 정원을 초과했습니다." : ""}{hasBusySelected ? " · 일정이 겹치는 참석자가 있습니다." : ""}
      </p>
    </section>}
    {!open && <span className={warn ? "reservation-capacity-warning" : "reservation-field-hint"}>
      예약자 포함 {count}명{capacity !== undefined ? ` / ${capacity}명` : ""}{overCapacity ? " · 정원 초과" : ""}{hasBusySelected ? " · 일정 겹침" : ""}
    </span>}
  </div>;
}
