import { useEffect, useId, useState, type ReactNode } from "react";
import searchIcon from "../../assets/chat-search.svg";
import { useSelectableUsers } from "../hooks/useSelectableUsers";
import { filterUsersByName } from "./filterUsersByName";
import "./UserPicker.css";

type Parts = { search: ReactNode; summary: ReactNode; selection: ReactNode; results: ReactNode };
type Props = {
  selectionMode: "single" | "multiple";
  selectedIds: string[];
  excludedIds?: string[];
  unavailableIds?: ReadonlySet<string>;
  unavailableLabel?: string;
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  appearance?: "compact" | "panel";
  listLabel?: string;
  singleActionLabel?: string;
  children?: (parts: Parts) => ReactNode;
};

export default function UserPicker({ selectionMode, selectedIds, excludedIds = [], onChange, disabled = false,
  unavailableIds, unavailableLabel = "선택 불가", appearance = "compact", listLabel = "사용자 목록", singleActionLabel = "선택", children }: Props) {
  const directory = useSelectableUsers({ refreshOnMount: true });
  const [query, setQuery] = useState("");
  const searchId = useId();
  const ready = directory.status === "ready";
  const available = directory.users.filter(user => !excludedIds.includes(user.user_id));
  const visible = filterUsersByName(available, query);
  const selected = available.filter(user => selectedIds.includes(user.user_id));
  const validIds = new Set(available.map(user => user.user_id));

  useEffect(() => {
    if (!ready) return;
    const valid = [...new Set(selectedIds)].filter(id => validIds.has(id));
    const next = selectionMode === "single" ? valid.slice(0, 1) : valid;
    if (next.length !== selectedIds.length) onChange(next);
  });

  function choose(id: string) {
    if (disabled || !ready || !validIds.has(id) || (unavailableIds?.has(id) && !selectedIds.includes(id))) return;
    if (selectionMode === "single") onChange([id]);
    else onChange(selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id]);
  }
  const search = <div className="user-picker-search-row">
    <div className="user-picker-search"><img src={searchIcon} width="17" height="17" alt="" />
      <input id={searchId} type="search" aria-label="사용자 이름 검색" placeholder="이름 검색" value={query}
        disabled={disabled || !ready} onChange={event => setQuery(event.target.value)} />
    </div>
    <button className="user-picker-refresh" type="button" aria-label="사용자 목록 새로고침" title="사용자 목록 새로고침"
      disabled={disabled || directory.status === "loading"} onClick={() => void directory.refresh()}>↻</button>
  </div>;
  const summary = <div className="user-picker-summary"><strong>{selectionMode === "multiple" ? `선택한 사용자 ${selectedIds.length}명` : `전체 사용자 ${available.length}명`}</strong>
    <span>{query.trim() ? `검색 결과 ${visible.length}명` : `전체 ${available.length}명`}</span></div>;
  const selection = ready && selectionMode === "multiple" && selected.length > 0 && <ul className="user-picker-selected" aria-label="선택한 사용자">
    {selected.map(user => <li key={user.user_id}><button type="button" disabled={disabled} title={`${user.email} · ${user.team}`}
      aria-label={`${user.name} (${user.email}) 선택 해제`} onClick={() => choose(user.user_id)}>{user.name}<span aria-hidden="true">×</span></button></li>)}
  </ul>;
  const results = <div className={`user-picker-results user-picker-results--${selectionMode}`} aria-busy={directory.status === "idle" || directory.status === "loading"}>
    {(directory.status === "idle" || directory.status === "loading") && <p role="status">사용자 목록을 불러오는 중입니다.</p>}
    {directory.status === "error" && <div role="alert"><p>{directory.error}</p><button type="button" disabled={disabled} onClick={() => void directory.refresh()}>사용자 목록 다시 조회</button></div>}
    {ready && (visible.length > 0 ? <ul aria-label={listLabel}>{visible.map(user => {
      const identity = <span className="user-picker-identity"><strong>{user.name}</strong><span>{user.email}</span><small>{user.team}{unavailableIds?.has(user.user_id) ? ` · ${unavailableLabel}` : ""}</small></span>;
      return <li key={user.user_id}>{selectionMode === "multiple" ? <label className="user-picker-row">
        {identity}<input type="checkbox" aria-label={`${user.name} (${user.email}) 선택`} checked={selectedIds.includes(user.user_id)} disabled={disabled || (unavailableIds?.has(user.user_id) && !selectedIds.includes(user.user_id))} onChange={() => choose(user.user_id)} />
      </label> : <div className="user-picker-row">{identity}<button type="button" className="user-picker-choice" disabled={disabled}
        aria-label={`${user.name} (${user.email}) ${singleActionLabel}`} title={singleActionLabel} aria-pressed={selectedIds.includes(user.user_id)} onClick={() => choose(user.user_id)}>
        <span className="user-picker-choice-icon" aria-hidden="true" />
      </button></div>}</li>;
    })}</ul> : <p role="status">{query.trim() ? "검색 결과가 없습니다." : "선택 가능한 사용자가 없습니다."}</p>)}
  </div>;
  return <div className={`user-picker user-picker--${appearance}`}>{children
    ? children({ search, summary, selection, results }) : <>{search}{summary}{selection}{results}</>}</div>;
}
