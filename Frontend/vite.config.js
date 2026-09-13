import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: { allowedHosts: true },
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "https://backend-svc-production-a9ac.up.railway.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
