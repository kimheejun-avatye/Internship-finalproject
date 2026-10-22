import { post } from "../../shared/api/session-client";
export const changePassword = (current_password: string, new_password: string) => post<void>("/api/auth/password/change", { current_password, new_password }, true);
