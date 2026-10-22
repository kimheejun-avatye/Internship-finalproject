import { post, request } from "../../shared/api/session-client";
import type {
  CalendarQuery, CalendarReservation, CalendarRoom, CreatedReservation,
  CreateReservation, ReservationList, Room, TimeSlot,
} from "./reservations.types";

export const listRooms = () => request<Room[]>("/api/rooms");

export function listReservations(roomId: string, page: number) {
  const params = new URLSearchParams({ page: String(page) });
  return request<ReservationList>(`/api/rooms/${encodeURIComponent(roomId)}/reservations?${params}`);
}

export const createReservation = (data: CreateReservation) =>
  post<CreatedReservation>("/api/reservations", data, true);

export function getAvailability(roomId: string, date: string, slotMinutes = 60) {
  const params = new URLSearchParams({ date, slot_minutes: String(slotMinutes) });
  return request<TimeSlot[]>(`/api/rooms/${encodeURIComponent(roomId)}/availability?${params}`);
}

export function getCalendarReservations(query: CalendarQuery) {
  const params = new URLSearchParams({ start_at: query.start_at, end_at: query.end_at, scope: query.scope });
  if (query.room_id) params.set("room_id", query.room_id);
  return request<CalendarReservation[]>(`/api/calendar/reservations?${params}`);
}

export const getCalendarRooms = () => request<CalendarRoom[]>("/api/calendar/rooms");
