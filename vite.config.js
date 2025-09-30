import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const backendURL = isDev
    ? "http://localhost:5000"
    : "https://beypro-backend.onrender.com";

  return {
    plugins: [react()],
    base: mode === "production" ? "./" : "/",

    build: {
      outDir: "dist",
      assetsDir: "",
      chunkSizeWarningLimit: 3000,
    },

    server: {
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: backendURL,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
