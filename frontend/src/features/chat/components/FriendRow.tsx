import type { ChatUser } from "../chat.types";

type Props = { user: ChatUser; selected?: boolean; onToggle?: (id: string) => void; onOpen?: (id: string) => void };
export default function FriendRow({ user, selected, onToggle, onOpen }: Props) {
  const profile = <span className="chat-friend-profile"><strong>{user.name}</strong><span>{user.profile}</span><small>{user.team}</small></span>;
  return <li>
    {onToggle ? <label className="chat-friend-row">
      {profile}<input type="checkbox" aria-label={user.name + " (" + user.email + ") 선택"} checked={!!selected} onChange={() => onToggle(user.user_id)} />
    </label> : <div className="chat-friend-row">
      {profile}<button type="button" className="chat-friend-choice" aria-label={user.name + " (" + user.team + ") 대화 열기"} title="개인 대화 열기" onClick={() => onOpen?.(user.user_id)}><span className="chat-friend-message" aria-hidden="true" /></button>
    </div>}
  </li>;
}
