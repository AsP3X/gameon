import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

// Generated or recorded files: never formatted or linted by hand.
const generated = ['dist/**', 'src/protocol/generated/**'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The Rust server (server/crates/skt-server). Same origin for the browser, WebSocket included.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true, ws: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  lint: {
    ignorePatterns: generated,
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: generated,
    singleQuote: true,
    semi: true,
    printWidth: 120,
  },
});
