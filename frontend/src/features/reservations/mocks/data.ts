// 서버 API가 붙기 전까지 화면을 채우는 임시 데이터

export type RoomStatus = "ACTIVE" | "MAINTENANCE";

export interface Room {
  id: string;
  letter: string;
  capacity: number;
  features: string[];
  status: RoomStatus;
}

export interface Reservation {
  id: string;
  roomId: string;
  date: string; // YYYY-MM-DD
  start: number; // 시간 단위 (9, 10.5 …)
  end: number;
  title: string;
  team: string;
  people: number;
  mine: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  team: "AVATYE" | "GURU";
  role: "관리자" | "일반 구성원";
  approved: boolean;
}

export const ROOMS: Room[] = [
  { id: "A", letter: "A", capacity: 6, features: ["모니터", "화이트보드"], status: "ACTIVE" },
  { id: "B", letter: "B", capacity: 8, features: ["모니터", "화상회의"], status: "ACTIVE" },
  { id: "C", letter: "C", capacity: 4, features: ["화이트보드"], status: "ACTIVE" },
  { id: "D", letter: "D", capacity: 10, features: ["모니터", "화상회의"], status: "MAINTENANCE" },
];

export const RESERVATIONS: Reservation[] = [
  { id: "1", roomId: "A", date: "2026-10-12", start: 9, end: 10.5, title: "주간 킥오프", team: "운영팀", people: 5, mine: true },
  { id: "2", roomId: "B", date: "2026-10-12", start: 14, end: 16, title: "제품 기획", team: "기획팀", people: 6, mine: false },
  { id: "3", roomId: "B", date: "2026-10-13", start: 10, end: 12, title: "파트너 미팅", team: "사업팀", people: 4, mine: false },
  { id: "4", roomId: "C", date: "2026-10-14", start: 9, end: 10, title: "운영 체크인", team: "운영팀", people: 3, mine: false },
  { id: "5", roomId: "A", date: "2026-10-14", start: 15, end: 16.5, title: "개발 리뷰", team: "개발팀", people: 5, mine: true },
  { id: "6", roomId: "B", date: "2026-10-15", start: 12, end: 13, title: "UX 워크숍", team: "디자인팀", people: 6, mine: false },
  { id: "7", roomId: "A", date: "2026-10-16", start: 9, end: 10, title: "서비스 운영 미팅", team: "운영팀", people: 4, mine: false },
  { id: "8", roomId: "A", date: "2026-10-16", start: 11, end: 12, title: "디자인 리뷰", team: "디자인팀", people: 5, mine: false },
  { id: "9", roomId: "A", date: "2026-10-16", start: 16, end: 17, title: "개발 스프린트 회의", team: "개발팀", people: 6, mine: true },
];

export const MEMBERS: Member[] = [
  { id: "1", name: "김희준", email: "heejun@example.com", team: "AVATYE", role: "관리자", approved: true },
  { id: "2", name: "이서연", email: "seoyeon@example.com", team: "AVATYE", role: "일반 구성원", approved: true },
  { id: "3", name: "박지훈", email: "jihoon@example.com", team: "GURU", role: "일반 구성원", approved: true },
  { id: "4", name: "최유진", email: "yujin@example.com", team: "GURU", role: "일반 구성원", approved: false },
];
