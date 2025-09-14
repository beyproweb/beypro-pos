import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Use relative paths in production so Electron (file://) can resolve them
  base: mode === 'production' ? '/' : '/',


  build: {
    outDir: 'dist',
    assetsDir: '',        // <-- FLATTEN: put hashed JS/CSS directly in dist/
    // OPTIONAL: raise chunk warning threshold for large apps
    chunkSizeWarningLimit: 3000
  },

  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'https://hurrypos-backend.onrender.com',
        changeOrigin: true
      }
    }
  }
}));
