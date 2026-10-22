import type { SelectableUser } from "../api/users";

export function filterUsersByName<T extends Pick<SelectableUser, "name">>(users: readonly T[], query: string): T[] {
  const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase();
  const name = normalize(query.trim());
  return users.filter(user => normalize(user.name).includes(name));
}
