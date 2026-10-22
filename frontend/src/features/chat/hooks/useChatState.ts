import { useSyncExternalStore } from "react";
import type { ChatData } from "../chat.types";

export function useChatState(data: ChatData) {
  return useSyncExternalStore(data.subscribe, data.getSnapshot, data.getSnapshot);
}
