import type { ChatUser, Team } from "../chat.types";

const profiles = [
  "개발팀 · 프론트엔드 개발자", "개발팀 · 백엔드 개발자", "개발팀 · 모바일 개발자", "개발팀 · QA 엔지니어",
  "디자인팀 · 프로덕트 디자이너", "디자인팀 · UX 디자이너", "디자인팀 · 브랜드 디자이너",
  "기획팀 · 서비스 기획자", "기획팀 · 프로덕트 매니저", "데이터팀 · 데이터 분석가",
  "마케팅팀 · 콘텐츠 마케터", "마케팅팀 · 퍼포먼스 마케터", "운영팀 · 서비스 운영", "인사팀 · 채용 담당자", "경영지원팀 · 총무",
];
const names: Record<Team, string[]> = {
  AVATYE: ["김희준", "박지훈", "이서윤", "정도현", "김민서", "최유진", "한지우", "윤서아", "장현우", "오수빈", "배하린", "신예준", "임다은", "송지호", "조유나"],
  GURU: ["김희오", "김의성", "이준서", "정하은", "박서진", "최도윤", "한예린", "윤지안", "장민우", "오채원", "배시우", "신유정", "임태오", "송아린", "조은호"],
};
export function createMockUsers(): ChatUser[] {
  return (["AVATYE", "GURU"] as const).flatMap(team => names[team].map((name, i) => ({
    user_id: `mock-${team.toLowerCase()}-${String(i + 1).padStart(2, "0")}`,
    name, email: `${team.toLowerCase()}.${i + 1}@example.com`, team, profile: profiles[i], online: i % 3 === 0 || i === 4,
  }))).sort((a, b) => a.name.localeCompare(b.name, "ko") || a.user_id.localeCompare(b.user_id));
}
export function createMockMe(team: Team): ChatUser {
  return { user_id: `mock-me-${team.toLowerCase()}`, name: "나", email: `me.${team.toLowerCase()}@example.com`, team, profile: "기획팀 · 프로덕트 매니저", online: true };
}
