import { execFileSync } from 'node:child_process';
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
// Skull King's lobby and socket. The rest of /api stays on the account server.
const sktGame = process.env.SKT_GAME_TARGET ?? 'http://127.0.0.1:8092';
// Where /ocho goes: Ocho's own server, beside the API.
const ocho = process.env.SKT_OCHO_TARGET ?? 'http://127.0.0.1:8091';
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

/**
 * How many test files run at once on this machine. The slow tests are whole games rendered into
 * jsdom: all work and no waiting, against a timeout on the wall clock. Vitest runs one file on every
 * core but one, and on Apple silicon half of those cores or more are efficiency cores, where such a
 * test takes three to five times as long and runs out of its time. So a Mac runs as many files as it
 * has performance cores; the whole suite is no slower for it. Anywhere else the cores are alike, and
 * Vitest's own count stands.
 */
function testWorkers(): number | undefined {
  if (process.platform !== 'darwin') return undefined;
  try {
    const cores = Number.parseInt(
      execFileSync('/usr/sbin/sysctl', ['-n', 'hw.perflevel0.logicalcpu'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
      10,
    );
    return cores > 0 ? cores : undefined;
  } catch {
    // An Intel Mac has no such levels: its cores are alike.
    return undefined;
  }
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
      '/api/v1/ws': { target: sktGame, changeOrigin: true, ws: true },
      '/api/v1/lobbies': { target: sktGame, changeOrigin: true },
      '/api/v1/metrics': { target: sktGame, changeOrigin: true },
      '/api': { target: api, changeOrigin: true, ws: true },
      // Ocho's lobby and table server (server/crates/ocho-server). The page's own Ocho addresses
      // are under /games/ocho, so nothing of the page is sent there.
      '/ocho/': { target: ocho, changeOrigin: true, ws: true },
    },
  },
  test: e2e
    ? { include: ['e2e/**/*.e2e.ts'], testTimeout: 600_000, hookTimeout: 120_000, fileParallelism: false }
    : { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], maxWorkers: testWorkers() },
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
