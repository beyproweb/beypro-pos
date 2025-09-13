import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use relative asset paths only in production (for Electron file://)
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? './' : '/',   // <-- key change
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'https://hurrypos-backend.onrender.com',
        changeOrigin: true,
      },
    },
  },
}));
