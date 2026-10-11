/* The stage of the end-to-end script: which server the page talks to, the dev server in front of
   it, and a browser.

   The page is always the real one, served by `vp dev`, speaking through the dev proxy: it asks
   `POST /api/v1/auth/guest` for a session and opens `/api/v1/ws` on its own origin. What changes is
   only where the proxy sends `/api`:

     - the Rust server on 127.0.0.1:8080, when one is listening there (or SKT_E2E_TARGET names one);
     - otherwise the mock host of this folder, on a port of its own.

   So the same script runs against either. A missing Rust server is not a failure: the script says
   which target it used. */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import { startMockHost } from './mockHost';

const WEB = fileURLToPath(new URL('..', import.meta.url));
/** Where the Rust server listens in development: the default target of the dev proxy (vite.config.ts). */
export const RUST_SERVER = 'http://127.0.0.1:8080';

export interface Stage {
  /** The page's address. */
  url: string;
  /** What `/api` reaches: the real server, or the mock host. */
  target: 'server' | 'mock';
  browser: Browser;
  close(): Promise<void>;
}

async function healthy(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** `vp dev` on a port of its own, with `/api` sent to `api`. Resolves when it serves the page. */
async function startDevServer(api: string): Promise<{ url: string; stop(): void }> {
  const port = await freePort(),
    url = `http://localhost:${port}`;
  const child: ChildProcess = spawn('npx', ['vp', 'dev', '--port', String(port), '--strictPort'], {
    cwd: WEB,
    env: { ...process.env, SKT_API_TARGET: api, SKT_E2E: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so stopping it takes the tools it started along.
    detached: true,
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const stop = (): void => {
    if (child.pid != null && child.exitCode == null) process.kill(-child.pid, 'SIGTERM');
  };
  for (let i = 0; i < 150; i++) {
    if (child.exitCode != null) throw new Error(`vp dev stopped before it served the page:\n${output}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return { url, stop };
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  throw new Error(`vp dev did not serve ${url} in time:\n${output}`);
}

/** A Chromium to drive: the Chrome or Edge on this machine, or the one Playwright installed. */
async function launch(): Promise<Browser> {
  const headless = process.env.SKT_E2E_HEADED !== '1';
  const failures: string[] = [];
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      return await chromium.launch({ channel, headless });
    } catch (e) {
      failures.push(`${channel ?? 'bundled chromium'}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  }
  throw new Error(
    `No browser to drive. Install Chrome, or run "npx playwright-core install chromium".\n${failures.join('\n')}`,
  );
}

/**
 * Set the stage. SKT_E2E_TARGET picks the server: a URL, `mock`, or nothing, which means the Rust
 * server if it answers on 127.0.0.1:8080 and the mock host if it does not.
 */
export async function openStage(): Promise<Stage> {
  const wanted = process.env.SKT_E2E_TARGET ?? '';
  const closers: (() => Promise<void> | void)[] = [];
  const close = async (): Promise<void> => {
    for (const fn of closers.reverse()) await fn();
  };
  try {
    let api: string, target: Stage['target'];
    if (wanted && wanted !== 'mock') {
      if (!(await healthy(wanted))) throw new Error(`SKT_E2E_TARGET=${wanted} does not answer GET /api/v1/health`);
      [api, target] = [wanted, 'server'];
    } else if (wanted !== 'mock' && (await healthy(RUST_SERVER))) [api, target] = [RUST_SERVER, 'server'];
    else {
      // Short pauses, so a whole game does not take minutes. The deadlines stay the standard ones.
      const host = await startMockHost({ timers: { trickEndMs: 700 }, bot: { minMs: 250, maxMs: 500 } });
      closers.push(() => host.close());
      [api, target] = [host.url, 'mock'];
    }
    const dev = await startDevServer(api);
    closers.push(() => dev.stop());
    const browser = await launch();
    closers.push(() => browser.close());
    return { url: dev.url, target, browser, close };
  } catch (e) {
    await close();
    throw e;
  }
}
