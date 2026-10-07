// Production smoke test: builds, serves dist/, plays through the menus and checks
//   - no console errors
//   - no network request leaves the device (offline-capable; ads are native-only)
//   - axe accessibility scan of home, settings and awards (serious/critical issues fail)
// Usage: node scripts/prod-check.mjs   (does not need the dev server)
import { spawn, execSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const PORT = 5176;
execSync('npx vite build', { stdio: 'pipe' });
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  {
    stdio: 'pipe',
  },
);
await new Promise((r) => setTimeout(r, 2500));
const url = `http://localhost:${PORT}/`;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    // axe needs a page from an explicit context
    const context = await browser.newContext({ locale: 'en-US', viewport });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))
        external.push(r.url());
    });
    await page.goto(url);
    await page.waitForTimeout(2500);
    const tag = `${viewport.width}×${viewport.height}`;
    check(
      `${tag}: first run shows the tutorial`,
      await page.getByRole('button', { name: 'Skip' }).isVisible(),
    );
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.locator('.pause').getByRole('button', { name: 'Home' }).click();
    await page.waitForTimeout(500);

    const scan = async (label) => {
      const res = await new AxeBuilder({ page }).include('#ui').analyze();
      const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      check(
        `${tag}: a11y ${label}`,
        bad.length === 0,
        bad.map((v) => `${v.id} ×${v.nodes.length}`).join(', '),
      );
    };
    await scan('home');
    await page.locator('.home').getByRole('button', { name: 'Settings' }).click();
    await page.waitForTimeout(500);
    await scan('settings');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('.home').getByRole('button', { name: 'Awards' }).click();
    await page.waitForTimeout(500);
    await scan('awards');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(400);
    await page.locator('.journey-btn').click();
    await page.waitForTimeout(500);
    await page.locator('.stone').first().click();
    await page.waitForTimeout(400);
    await scan('journey map');
    await page.locator('.journey .level-sheet .cta').click();
    await page.waitForTimeout(800);
    await scan('level intro');

    check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    check(
      `${tag}: no network requests leave the device`,
      external.length === 0,
      external.slice(0, 3).join(', '),
    );
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nproduction build OK');
process.exit(failed ? 1 : 0);
