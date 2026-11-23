import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = process.env.PREVIEW_BASE || 'http://localhost:4321/dev-log';
const out = process.env.SHOT_DIR || `${process.env.TEMP}\\blog-shot`;

await mkdir(out, { recursive: true });

const targets = [
  { name: 'desk-home', url: `${base}/`, width: 1440, height: 1000, mobile: false },
  { name: 'desk-post', url: `${base}/notes/opc-ua-badnodeid/`, width: 1440, height: 1200, mobile: false },
  { name: 'mobile-home', url: `${base}/`, width: 390, height: 844, mobile: true },
  { name: 'mobile-post', url: `${base}/notes/opc-ua-badnodeid/`, width: 390, height: 844, mobile: true },
];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${process.env.TEMP}\\edge-pptr-profile`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
  ],
});

for (const t of targets) {
  const page = await browser.newPage();
  await page.setViewport({
    width: t.width,
    height: t.height,
    deviceScaleFactor: 1,
    isMobile: t.mobile,
    hasTouch: t.mobile,
  });
  await page.goto(t.url, { waitUntil: 'networkidle0', timeout: 30000 });
  const metrics = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
  }));
  console.log(
    `${t.name}: viewport=${t.width} scrollW=${metrics.scrollW} clientW=${metrics.clientW} overflow=${
      metrics.scrollW > metrics.clientW + 1
    } scrollH=${metrics.scrollH}`,
  );
  await page.screenshot({ path: `${out}\\${t.name}.png`, fullPage: false });
  await page.close();
}

await browser.close();
