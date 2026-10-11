// The app icons, drawn from the two SVGs in public/icons. Run it after changing either:
//   node scripts/generate-icons.mjs
// It needs Chrome or Edge on the machine, like the end-to-end script (e2e/README.md).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const icons = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
];

let browser;
for (const channel of ['chrome', 'msedge', undefined]) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch {
    // The next one.
  }
}
if (!browser) throw new Error('No Chrome, Edge or Playwright Chromium to draw the icons with');
try {
  for (const [source, name, size] of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = await readFile(dir + source, 'utf8');
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await writeFile(dir + name, await page.screenshot({ omitBackground: true }));
    await page.close();
    console.log(`${name}: ${size} x ${size}`);
  }
} finally {
  await browser.close();
}
