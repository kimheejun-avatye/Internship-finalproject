import { post, request } from "./session-client";
import type { ChallengeResponse, CompletionResult } from "@captchavatye/react";

export interface Room {
  room_id: string;
  name: string;
  status: "ACTIVE" | "BLOCK";
  capacity: number;
}

export interface ReservationItem {
  reservation_id: string;
  room_id: string;
  user_id: string;
  title: string;
  start_at: string;
  end_at: string;
  participant_count: number;
  team: "AVATYE" | "GURU";
}

export interface ReservationList {
  items: ReservationItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateReservation {
  room_id: string;
  title: string;
  start_at: string;
  end_at: string;
  // TODO: 선택한 참여자 user_id 목록 (백엔드 attendee_ids). 주최자는 서버가 자동 포함한다.
  attendee_ids?: string[];
}

export interface CaptchaAttempt {
  intent_id: string;
  challenge: ChallengeResponse;
  expires_at: string;
}

export interface ReservationCaptchaProof {
  intent_id: string;
  challenge_id: string;
  completion_id: string;
}

export interface CreatedReservation extends CreateReservation {
  reservation_id: string;
  user_id: string;
  created_at: string;
}

export const listRooms = () => request<Room[]>("/api/rooms");
export const listReservations = (roomId: string, page: number) =>
  request<ReservationList>(`/api/rooms/${encodeURIComponent(roomId)}/reservations?page=${page}`);
export const createReservation = (data: CreateReservation, captcha: ReservationCaptchaProof) =>
  post<CreatedReservation>("/api/reservations", { ...data, captcha }, true);

export const prepareReservationCaptcha = (data: CreateReservation) =>
  post<CaptchaAttempt>("/api/reservations/captcha", data, true);

export const reservationCaptchaProof = (
  attempt: CaptchaAttempt,
  completion: CompletionResult,
): ReservationCaptchaProof => ({
  intent_id: attempt.intent_id,
  challenge_id: completion.challengeId,
  completion_id: completion.completionId,
});

export interface TimeSlot {
  start_at: string;
  end_at: string;
  available: boolean;
  reason: string | null;
}

// TODO: 날짜(YYYY-MM-DD)와 회의실별 가능 시간 슬롯 조회
export const getAvailability = (roomId: string, date: string, slotMinutes = 60) =>
  request<TimeSlot[]>(
    `/api/rooms/${encodeURIComponent(roomId)}/availability?date=${date}&slot_minutes=${slotMinutes}`,
  );

