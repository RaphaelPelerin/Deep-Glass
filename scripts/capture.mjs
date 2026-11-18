// Screenshots for the README, from the built demo (npm run build:demo first).
// Needs a local Chrome; refraction is Chromium-only, so this is what Chrome users see.
//   node scripts/capture.mjs [path/to/chrome]
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = join(root, 'demo/dist');
const out = join(root, '.github/assets');
const chrome =
  process.argv[2] ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find((p) => existsSync(p));
if (!chrome) throw new Error('Chrome not found: pass its path as the first argument');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  try {
    const body = await readFile(join(site, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const box = (sel, pad) =>
  page.$eval(
    sel,
    (el, pad) => {
      const b = el.getBoundingClientRect();
      return { x: b.left + scrollX - pad, y: b.top + scrollY - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
    },
    pad,
  );
const shot = async (name, clip) => {
  await page.screenshot({ path: join(out, `${name}.webp`), type: 'webp', quality: 86, clip });
  console.log(`.github/assets/${name}.webp`);
};

await page.goto(url, { waitUntil: 'networkidle0' });
await wait(4000);
await shot('loupe', await box('#lens', 70));

await page.evaluate(() => document.querySelector('#card').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.mouse.move(1150, 320);
await wait(1200);
await shot('card', await box('.profile', 60));

await page.evaluate(() => document.querySelector('#components').scrollIntoView({ block: 'start', behavior: 'instant' }));
await wait(1200);
// the segmented drop, held and dragged: a lens over the labels
const week = await page.$eval('#range [role="radio"]:nth-child(2)', (b) => {
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(week.x, week.y);
await page.mouse.down();
await page.mouse.move(week.x + 64, week.y, { steps: 10 });
await wait(400);
await shot('drop', await box('#range', 30));
await page.mouse.up();
// the whole board on screen (the wallpaper is fixed: it only exists in the viewport), no bars over it
await page.evaluate(() => {
  for (const el of document.querySelectorAll('.nav, .dock')) el.style.visibility = 'hidden';
  document.querySelector('.board').scrollIntoView({ block: 'center', behavior: 'instant' });
});
await page.mouse.move(700, 880);
await wait(1400);
await shot('components', await box('.board', 30));

// the social preview (GitHub, link previews): 1280×640, the title under the loupe and the card
await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle0' });
await page.addStyleTag({ content: '.hero{min-height:640px;padding:70px 20px 60px;gap:16px}.hero .lead,.hero-actions,.pill,.dock{display:none}.lens{top:198px;left:560px}.lens span{visibility:hidden}' });
await page.mouse.move(820, 300);
await wait(4000);
await page.screenshot({ path: join(out, 'og.jpg'), type: 'jpeg', quality: 90 });
console.log('.github/assets/og.jpg');

await browser.close();
server.close();
