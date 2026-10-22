export interface Room {
  room_id: string;
  name: string;
  status: "ACTIVE" | "BLOCK";
  capacity: number;
}

export type CalendarRoom = Room;

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
  attendee_ids: string[];
}

// 생성 응답은 참석자·회의실 이름을 포함하지 않는다.
export interface CreatedReservation {
  reservation_id: string;
  room_id: string;
  user_id: string;
  title: string;
  start_at: string;
  end_at: string;
  created_at: string;
}

export interface BusyUsers { user_ids: string[] }

export interface TimeSlot {
  start_at: string;
  end_at: string;
  available: boolean;
  reason: string | null;
}

export interface CalendarReservation {
  reservation_id: string;
  title: string;
  room_id: string;
  room_name: string;
  organizer_id: string;
  start_at: string;
  end_at: string;
  participant_count: number;
  is_mine: boolean; // 로그인 사용자가 예약 생성자인지: 생성자 표시와 삭제 권한에 사용한다.
  is_attending: boolean; // 로그인 사용자가 예약 참석자인지: 나만 보기와 회의록 접근에 사용한다.
}

export interface CalendarQuery {
  start_at: string;
  end_at: string;
  scope: "all" | "mine";
  room_id?: string;
}
