import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    // In `npm run dev`, forward API calls to the Express server.
    // In Docker, nginx does the same job (see nginx.conf).
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
});
