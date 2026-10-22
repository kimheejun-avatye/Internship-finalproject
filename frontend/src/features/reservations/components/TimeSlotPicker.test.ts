import { describe, expect, it } from "vitest";
import { isAvailableRange, slotTime } from "./TimeSlotPicker";
import { MAX_RESERVATION_HOURS } from "../reservation-time";
import type { TimeSlot } from "../reservations.types";

// 2026-10-19(월) 하루의 24개 슬롯. blocked 시각은 불가로 만든다.
function daySlots(blockedHours: number[] = []): TimeSlot[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return {
      start_at: slotTime("2026-10-19", `${pad(hour)}:00`),
      end_at: hour === 23 ? slotTime("2026-10-20", "00:00") : slotTime("2026-10-19", `${pad(hour + 1)}:00`),
      available: !blockedHours.includes(hour),
      reason: blockedHours.includes(hour) ? "RESERVED" : null,
    };
  });
}

describe("isAvailableRange", () => {
  const start = slotTime("2026-10-19", "09:00");

  it("allows a range up to the maximum reservation length", () => {
    const end = slotTime("2026-10-19", `${9 + MAX_RESERVATION_HOURS}:00`.padStart(5, "0"));
    expect(isAvailableRange(daySlots(), start, end)).toBe(true);
  });

  it("rejects a range longer than the maximum even when every hour is free", () => {
    const end = slotTime("2026-10-19", `${9 + MAX_RESERVATION_HOURS + 1}:00`.padStart(5, "0"));
    expect(isAvailableRange(daySlots(), start, end)).toBe(false);
  });

  it("rejects a range that contains an unavailable hour", () => {
    expect(isAvailableRange(daySlots([10]), start, slotTime("2026-10-19", "12:00"))).toBe(false);
  });
});
