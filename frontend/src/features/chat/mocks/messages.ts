import type { ChatMessage, ChatRoom, ChatUser } from "../chat.types";

const texts = [
  "안녕하세요! 이번 주 일정 함께 확인해요.", "좋아요. 필요한 자료는 미리 정리해 둘게요.",
  "검토할 항목입니다.\n1. 화면 구성과 접근성\n2. 예약 흐름과 안내 문구\n3. 다음 주 작업 일정",
  "자료 확인했습니다. 의견 남겨 둘게요.",
  "긴 내용도 확인해 주세요. 화면이 좁아져도 메시지가 말풍선 밖으로 나가지 않고 자연스럽게 줄바꿈되어야 합니다. " + "회의자료확인".repeat(18),
  "오늘 프로덕트 주간 회의는\n회의실 A에서 진행하나요?", "네! 오후 2시부터 3시까지예요.",
  "회의실 예약을 공유했습니다.", "확인했어요. 시안도 함께 준비할게요.", "좋아요. 회의 때 같이 확인해요!", "네, 회의실 A에서 뵐게요!", "이번 주 회의 자료 공유드립니다.",
];
export function seedMessages(room: ChatRoom, me: ChatUser, offset: number): ChatMessage[] {
  return texts.map((message, i) => {
    const own = [1, 3, 6, 7, 9].includes(i);
    const sender = own ? me : room.members[i % room.members.length];
    return {
      message_id: `${room.chat_room_id}-message-${i}`, chat_room_id: room.chat_room_id,
      user_id: sender.user_id, sender: { user_id: sender.user_id, name: sender.name }, message,
      created_at: new Date(Date.UTC(2026, 9, i < 5 ? 15 : 16, 5, i + offset)).toISOString(), client_id: null,
      presentation: {
        ...(own ? { readCount: i === 9 ? 0 : room.member_count - 1 } : {}),
        ...(i === 7 ? { reservation: { title: "프로덕트 주간 회의", startsAt: "2026-10-16T14:00:00+09:00", endsAt: "2026-10-16T15:00:00+09:00", room: "회의실 A" } } : {}),
      },
    };
  });
}
