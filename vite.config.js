// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  // Your backend API target
  const backendURL = isDev
    // Use IPv4 localhost to avoid ::1 ECONNREFUSED when backend isn't bound on IPv6.
    ? "http://127.0.0.1:5000"
    : "https://api.beypro.com";

  /**
   * IMPORTANT:
   * Electron builds MUST use relative "./"
   * Web builds (frontend, Vercel, web app) MUST use "/"
   *
   * This is controlled ONLY by:
   *    VITE_TARGET=electron
   */
  const isElectron = process.env.VITE_TARGET === "electron";

  return {
    plugins: [react()],

    // ⬇⬇ FIX: Correct asset base for Electron
    base: isElectron ? "./" : "/",

    build: {
      outDir: "dist",
      emptyOutDir: true,
      assetsDir: "assets",
      // Prevent chunk size warnings
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
        // Socket.IO uses /socket.io/* on the same origin; proxy it to backend in dev.
        "/socket.io": {
          target: backendURL,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    /**
     * Electron needs correct resolution of file URLs.
     * This ensures import.meta.url works inside Electron.
     */
    resolve: {
      conditions: isElectron ? ["browser"] : [],
    },
  };
});
