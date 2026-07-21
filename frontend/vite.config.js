import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API + uploaded evidence to the backend during development.
// Set VITE_API_URL (e.g. in frontend/.env) to point the dev proxy at a
// non-default backend; defaults to the local backend on :4000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_URL || 'http://localhost:4000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
      },
    },
  };
});
