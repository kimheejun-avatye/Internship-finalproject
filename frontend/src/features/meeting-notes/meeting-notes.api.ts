import { request } from "../../shared/api/session-client";
import type { MeetingNote } from "./meeting-notes.types";

const path = (id: string) => `/api/reservations/${encodeURIComponent(id)}/memo`;
export const getMeetingNote = (id: string, signal?: AbortSignal) => request<MeetingNote | null>(path(id), "GET", undefined, false, signal);
export const saveMeetingNote = (id: string, memo: string) => request<MeetingNote>(path(id), "PUT", { memo }, true);
