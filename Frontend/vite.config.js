import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
      },
    },
  },
  preview: { allowedHosts: true },
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "https://backend-svc-production-41e0.up.railway.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
