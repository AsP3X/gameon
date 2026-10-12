/* The built page as an installed app: it has a manifest and a service worker, the worker never
   answers for the server, and with the server gone the page still opens and the offline modes play.

   This one does not run against `vp dev`: a service worker exists only in a build. It builds the
   page, serves it with `vp preview` in front of the mock host, and then takes both away. */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { startMockHost } from './mockHost';
import { freePort, launch } from './stage';

const WEB = fileURLToPath(new URL('..', import.meta.url));

let url: string;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let preview: ChildProcess;
let host: Awaited<ReturnType<typeof startMockHost>>;
/** Every answer the page got for a request under /api: its path, and whether the worker gave it. */
const api: { path: string; worker: boolean }[] = [];

let serving = false;
const stopPreview = (): void => {
  if (!serving || preview.pid == null) return;
  serving = false;
  // Its own process group, so the server it started goes with it.
  process.kill(-preview.pid, 'SIGTERM');
};

beforeAll(async () => {
  host = await startMockHost({});
  // The test runner's own NODE_ENV would make this a development build, which has no worker.
  const env = { ...process.env, NODE_ENV: 'production', SKT_API_TARGET: host.url, SKT_E2E: '' };
  const built = spawnSync('npx', ['vp', 'build'], { cwd: WEB, env, encoding: 'utf8' });
  if (built.status !== 0) throw new Error(`vp build failed:\n${built.stdout}\n${built.stderr}`);
  const port = await freePort();
  url = `http://localhost:${port}`;
  preview = spawn('npx', ['vp', 'preview', '--port', String(port), '--strictPort'], {
    cwd: WEB,
    env,
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {
      // Not up yet.
    }
    if (i > 100 || preview.exitCode != null) throw new Error(`vp preview did not serve ${url}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  serving = true;
  browser = await launch();
  context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/')) api.push({ path, worker: response.fromServiceWorker() });
  });
});
afterAll(async () => {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  stopPreview();
  await host?.close();
});

/** A page that opens on the home screen greets first. "Come in" closes that sheet, as a person would. */
const comeIn = async (): Promise<void> => {
  const greeting = page.getByRole('button', { name: 'Come in' });
  if (await greeting.isVisible()) await greeting.click();
};

describe('the built page as an app', () => {
  it('names a manifest with icons that are there', async () => {
    // Where the installed app opens: Skull King's home, not the landing around it.
    await page.goto(`${url}/skull-king`);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.json');
    const manifest = (await (await fetch(url + href)).json()) as {
      name: string;
      display: string;
      start_url: string;
      icons: { src: string; sizes: string; type: string; purpose: string }[];
    };
    expect(manifest).toMatchObject({ name: 'Skull King Tavern', display: 'standalone', start_url: '/skull-king' });
    expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const icon of manifest.icons) {
      const res = await fetch(url + icon.src);
      expect(res.ok, icon.src).toBe(true);
      expect(res.headers.get('content-type'), icon.src).toBe('image/png');
    }
  });

  it('is controlled by a service worker that kept the build and not one answer of the server', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${url}/sw.js`);
    const kept = await page.evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
      return paths;
    });
    expect(kept).toContain('/index.html');
    expect(kept).toContain('/manifest.json');
    expect(kept.some((path) => /^\/assets\/main-.+\.js$/.test(path))).toBe(true);
    expect(kept.filter((path) => path.startsWith('/api'))).toEqual([]);
    expect(kept.filter((path) => path === '/sw.js')).toEqual([]);
  });

  it('talks to the server itself: nothing under /api comes from the worker', async () => {
    await page.locator('.sk-home .logo').waitFor();
    await comeIn();
    await page.locator('.sk-way[href="/skull-king/online"]').click();
    await page.getByText('Connected').waitFor();
    // The page is told of an answer before this script is: wait for the script to have heard of one.
    await expect.poll(() => api.length).toBeGreaterThan(0);
    expect(api.filter((answer) => answer.worker)).toEqual([]);
    await page.getByRole('button', { name: 'Back' }).click();
  });

  it('opens with the server gone, says so online, and still deals a game against bots', async () => {
    stopPreview();
    await host.close();
    await page.reload();
    await page.locator('.sk-home .logo').waitFor();
    await comeIn();
    // The home says nobody answers, and Online is out of reach there.
    await page.getByText('Not connected. Solo and One screen still work.').waitFor({ timeout: 30_000 });
    expect(await page.locator('.sk-way[href="/skull-king/online"]').count()).toBe(0);
    // The hub, opened by its address, says so too and leads back to what works.
    await page.goto(`${url}/skull-king/online`);
    await page.getByText("Can't reach the tavern").waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Play offline' }).click();
    await page.locator('.sk-home .logo').waitFor();
    await page.locator('.sk-way[href="/skull-king/solo"]').click();
    await page.locator('[data-act="start"]').click();
    await page.locator('.hand .card, .g-hand .card, [data-act="bid"]').first().waitFor({ timeout: 30_000 });
    // The game has an address of its own, and the table is at it.
    expect(new URL(page.url()).pathname).toBe('/skull-king/table');
  });

  it('opens any address of the page with the server gone, not only the front door', async () => {
    // Nothing answers: the worker gives the kept page for whatever address is asked for.
    await page.goto(`${url}/skull-king/score`);
    await page.getByRole('heading', { name: 'Score a real game' }).waitFor();
    expect(new URL(page.url()).pathname).toBe('/skull-king/score');
    await page.goto(`${url}/skull-king/online/join`);
    await page.getByRole('heading', { name: 'Join a table' }).waitFor();
    // The frame around the game is in the kept page too, and says that nobody answers.
    await page.goto(`${url}/games`);
    await page.getByRole('heading', { name: 'Games', exact: true }).waitFor();
    await page.getByText('Not connected. Trying again…').waitFor();
    expect(new URL(page.url()).pathname).toBe('/games');
    await page.goto(url);
    await page.getByRole('heading', { name: 'Game night, switched on.' }).waitFor();
    // An address that only leads somewhere is replaced by where it leads.
    await page.goto(`${url}/skull-king/ranked`);
    await page.getByRole('heading', { name: 'Play online' }).waitFor();
    expect(new URL(page.url()).pathname).toBe('/skull-king/online');
  });
});
