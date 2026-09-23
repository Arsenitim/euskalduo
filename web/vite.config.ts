import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In development, /api and /uploads are proxied to the running Docker stack.
const backend = process.env.EUSKALDUO_BACKEND ?? 'http://127.0.0.1:8765';

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': backend,
      '/uploads': backend,
    },
  },
  build: {
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
