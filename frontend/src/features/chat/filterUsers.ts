import type { ChatUser } from "./chat.types";

export function filterUsers(users: ChatUser[], query: string) {
  const normalize = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase();
  const search = normalize(query);
  return users.filter(user => [user.name, user.team, user.profile ?? ""].some(value => normalize(value).includes(search)));
}
