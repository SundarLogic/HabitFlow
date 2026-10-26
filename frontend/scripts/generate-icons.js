/**
 * Regenerates the app icons in public/icons/ from the logo design (public/favicon.svg):
 *   node scripts/generate-icons.js
 *
 * Renders SVGs with Playwright's Chromium (already a dev dependency for E2E), so no image tool
 * is needed. Icons:
 *   icon-192.png, icon-512.png   rounded tile ("any" purpose, used by browsers and Android)
 *   maskable-512.png             full-bleed tile with the check inside the 80% safe zone, so
 *                                Android can crop it to a circle or squircle
 *   apple-touch-icon.png (180)   full-bleed; iOS rounds the corners itself
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BRAND = '#4f46e5';
const CHECK = 'M9 16.5l4.5 4.5L23 11.5';

/** The logo as an SVG of `size` px. `bleed` fills the square; `scale` shrinks the check. */
function svg(size, { bleed = false, scale = 1 } = {}) {
  const offset = 16 - 16 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="${bleed ? 0 : 8}" fill="${BRAND}"/>
    <path transform="translate(${offset} ${offset}) scale(${scale})" d="${CHECK}" fill="none"
      stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

const ICONS = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { bleed: true, scale: 0.75 }],
  ['apple-touch-icon.png', 180, { bleed: true, scale: 0.85 }],
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, options] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size, options)}</body></html>`,
  );
  await page.locator('svg').screenshot({ path: `public/icons/${file}`, omitBackground: true });
  process.stdout.write(`public/icons/${file}\n`);
}
await browser.close();
