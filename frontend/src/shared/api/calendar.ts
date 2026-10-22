import { request } from "./session-client";

export interface CalendarReservation {
  reservation_id: string;
  title: string;
  room_id: string;
  room_name: string;
  organizer_id: string;
  start_at: string;
  end_at: string;
  participant_count: number;
  is_mine: boolean;
  is_attending: boolean;
}

export interface CalendarRoom {
  room_id: string;
  name: string;
  status: "ACTIVE" | "BLOCK";
  capacity: number;
}

export interface CalendarQuery {
  start_at: string;
  end_at: string;
  scope: "all" | "mine";
  room_id?: string;
}

export function getCalendarReservations(query: CalendarQuery) {
  const params = new URLSearchParams({
    start_at: query.start_at, end_at: query.end_at, scope: query.scope,
  });
  if (query.room_id) params.set("room_id", query.room_id);
  return request<CalendarReservation[]>(`/api/calendar/reservations?${params}`);
}

export const getCalendarRooms = () => request<CalendarRoom[]>("/api/calendar/rooms");
