export interface User { user_id: string; email: string; name: string; position?: string; team: "AVATYE" | "GURU"; role: "ADMIN" | "MEMBER" }
export interface SessionInfo { user: User; csrf_token: string; idle_expires_at: string; absolute_expires_at: string }
export interface Expiry { idle_expires_at: string; absolute_expires_at: string }
