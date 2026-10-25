import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const captchaUrl = env.CAPTCHAVATYE_URL || "http://127.0.0.1:8001";
  const backendUrl = env.BACKEND_URL || "http://127.0.0.1:8002";
  return {
    plugins: [react()],
    test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.ts" },
    server: { host: "127.0.0.1", port: 5175, strictPort: true,
      proxy: {
        "/captchavatye/api": { target: captchaUrl,
          rewrite: path => path.replace(/^\/captchavatye/, "") },
        "/api": backendUrl,
      },
    },
  };
});
