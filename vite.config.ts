import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /api przekierowujemy na serwer REST (npm run api, domyślnie port 3001).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
