import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";
  const backendURL = isDev
    ? "http://localhost:5000"
    : "https://hurrypos-backend.onrender.com";

  // Use relative base for Electron file:// builds to avoid /assets 404s
  const isElectronBuild = process.env.VITE_TARGET === "electron";

  return {
    plugins: [react()],

    // Keep "/" for web (Vercel). Use "./" when targeting Electron.
    base: isElectronBuild ? "./" : "/",

    build: {
      outDir: "dist",
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
