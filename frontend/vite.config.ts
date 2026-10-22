import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.ts" },
    // ws: 채팅·알림 실시간 연결(/api/ws)도 백엔드로 넘긴다
    server: { proxy: { "/api": { target: env.BACKEND_URL || "http://127.0.0.1:8000", ws: true } } },
  };
});
