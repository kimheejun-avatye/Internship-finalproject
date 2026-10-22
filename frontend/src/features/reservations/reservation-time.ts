// 예약 규칙. 서버(backend/app/schemas/reservations.py)의 같은 값과 맞춘다.
export const MAX_TITLE_LENGTH = 32;
export const MAX_RESERVATION_HOURS = 4;
export const MAX_BOOKING_DAYS = 365;

const SEOUL_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});
const SEOUL_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function seoulDay(value: Date | string = new Date(Date.now())) {
  const parts = SEOUL_DAY.formatToParts(typeof value === "string" ? new Date(value) : value);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function seoulTime(value: string) { return SEOUL_TIME.format(new Date(value)); }

// 날짜 계산에는 UTC 자정을 사용하고, 실제 API 경계에는 서울 시간대를 명시한다.
export function dateOf(day: string) { return new Date(`${day}T00:00:00Z`); }
export function dayKey(date: Date) { return date.toISOString().slice(0, 10); }
export function isValidDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = dateOf(day);
  return Number.isFinite(date.getTime()) && dayKey(date) === day;
}
export function addDays(day: string, amount: number) {
  const date = dateOf(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return dayKey(date);
}
export function mondayOf(day: string) { return addDays(day, -((dateOf(day).getUTCDay() + 6) % 7)); }
export function boundary(day: string) { return `${day}T00:00:00+09:00`; }
export function isWeekend(day: string) { return [0, 6].includes(dateOf(day).getUTCDay()); }
export function overlaps(item: { start_at: string; end_at: string }, day: string) {
  return Date.parse(item.start_at) < Date.parse(boundary(addDays(day, 1)))
    && Date.parse(item.end_at) > Date.parse(boundary(day));
}
