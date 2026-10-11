import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

// Generated or recorded files: never formatted or linted by hand.
const generated = ['dist/**', 'src/protocol/generated/**'];

// Where /api goes. The Rust server (server/crates/skt-server) by default; the end-to-end script
// points it at its own mock host while that server does not exist (e2e/README.md).
const api = process.env.SKT_API_TARGET ?? 'http://127.0.0.1:8080';
// `npm run e2e` runs the browser script in e2e/ instead of the unit tests: it needs a browser.
const e2e = process.env.SKT_E2E === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same origin for the browser, WebSocket included.
    proxy: {
      '/api': { target: api, changeOrigin: true, ws: true },
    },
  },
  test: e2e
    ? { include: ['e2e/**/*.e2e.ts'], testTimeout: 600_000, hookTimeout: 120_000, fileParallelism: false }
    : { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
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
