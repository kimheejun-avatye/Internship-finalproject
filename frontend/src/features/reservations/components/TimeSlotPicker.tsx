import type { TimeSlot } from "../reservations.types";
import { isValidDay } from "../reservation-time";

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
export const slotTime = (date: string, hour: string) => `${date}T${hour}:00+09:00`;

// Every hour must be present and available; missing days are never treated as free time.
export function isAvailableRange(slots: TimeSlot[], startAt: string, endAt: string) {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  let cursor = start;
  for (const slot of slots) {
    const slotStart = Date.parse(slot.start_at);
    const slotEnd = Date.parse(slot.end_at);
    if (slotEnd <= cursor) continue;
    if (slotStart !== cursor || !slot.available || slotEnd > end) return false;
    cursor = slotEnd;
    if (cursor === end) return true;
  }
  return false;
}

const reasonLabel: Record<string, string> = {
  PAST: "지난 시간", RESERVED: "예약됨", BLOCKED: "이용 제한", ROOM_UNAVAILABLE: "이용 중지",
};

type Props = {
  date: string; endDate: string; startHour: string; endHour: string;
  slots: TimeSlot[]; loading: boolean; disabled: boolean; now: number;
  onStartChange: (hour: string) => void; onEndChange: (hour: string) => void;
};

export default function TimeSlotPicker({ date, endDate, startHour, endHour, slots, loading, disabled, now, onStartChange, onEndChange }: Props) {
  const startAt = slotTime(date, startHour);
  const starts = new Map(slots.map(slot => [Date.parse(slot.start_at), slot]));
  return <>
    <label className="reservation-field">시작 (한국 시간)
      <select required value={startHour} disabled={disabled || loading} onChange={event => onStartChange(event.target.value)}>
        <option value="">{loading ? "시간 조회 중…" : "시작 선택"}</option>
        {HOUR_OPTIONS.map(hour => {
          const time = Date.parse(slotTime(date, hour));
          const slot = starts.get(time);
          const available = Boolean(slot?.available) && time >= now;
          const reason = time < now ? "지난 시간" : slot?.reason ? reasonLabel[slot.reason] ?? "선택 불가" : "선택 불가";
          return <option key={hour} value={hour} disabled={!available}>{hour}{available ? "" : ` · ${reason}`}</option>;
        })}
      </select>
    </label>
    <label className="reservation-field">종료 (한국 시간)
      <select required value={endHour} disabled={disabled || loading || !startHour || !isValidDay(endDate)} onChange={event => onEndChange(event.target.value)}>
        <option value="">종료 선택</option>
        {HOUR_OPTIONS.map(hour => <option key={hour} value={hour}
          disabled={!isAvailableRange(slots, startAt, slotTime(endDate, hour))}>
          {hour}{endDate !== date ? ` (${endDate.slice(5)})` : ""}
        </option>)}
      </select>
    </label>
  </>;
}
