import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 127.0.0.1, not localhost: on Windows, localhost resolves to ::1 first
      // and the backend listens on IPv4 only — costs ~2s per request.
      "/api": "http://127.0.0.1:8000",
    },
  },
});
