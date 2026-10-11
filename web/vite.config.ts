import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import type { Plugin } from 'vite-plus';

// Generated or recorded files: never formatted or linted by hand.
const generated = ['dist/**', 'src/protocol/generated/**'];

// Where /api goes. The Rust server (server/crates/skt-server) by default; the end-to-end script
// points it at its own mock host while that server does not exist (e2e/README.md).
const api = process.env.SKT_API_TARGET ?? 'http://127.0.0.1:8080';
// `npm run e2e` runs the browser script in e2e/ instead of the unit tests: it needs a browser.
const e2e = process.env.SKT_E2E === '1';

/**
 * Tells the built service worker (src/sw.ts) which files the build wrote. It runs when everything
 * is on disk, lists the output and writes the list, and a name made from it, over the two markers
 * in sw.js. The worker is left out: it is not its own file to keep.
 */
function precache(): Plugin {
  let out = 'dist';
  return {
    name: 'skt-precache',
    apply: 'build',
    configResolved(config) {
      out = join(config.root, config.build.outDir);
    },
    async closeBundle() {
      const names = (await readdir(out, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map(
          (entry) =>
            '/' +
            join(entry.parentPath, entry.name)
              .slice(out.length + 1)
              .split('\\')
              .join('/'),
        )
        // Every browser that runs a service worker reads woff2: the older copy of each font is left to the network.
        .filter((name) => name !== '/sw.js' && !name.endsWith('.woff'))
        .sort();
      const bad = names.find((name) => /[|'"`\\\s]/.test(name));
      if (bad) throw new Error(`A built file's name cannot be written into the worker: ${bad}`);
      const hash = createHash('sha256');
      for (const name of names) hash.update(name).update(await readFile(join(out, name)));
      const path = join(out, 'sw.js'),
        source = await readFile(path, 'utf8');
      if (!source.includes('__SKT_PRECACHE__') || !source.includes('__SKT_VERSION__'))
        throw new Error('sw.js has lost its markers: the worker would keep nothing');
      await writeFile(
        path,
        source.replace('__SKT_PRECACHE__', names.join('|')).replace('__SKT_VERSION__', hash.digest('hex').slice(0, 16)),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), precache()],
  build: {
    rolldownOptions: {
      // The worker is built next to the page and keeps its name: a browser asks for /sw.js again.
      input: { main: 'index.html', sw: 'src/sw.ts' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
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
