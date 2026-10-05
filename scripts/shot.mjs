// Usage: node scripts/shot.mjs <url> <outPrefix>
// Takes portrait (390x844) and landscape (1280x800) screenshots and prints console errors.
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', out = 'shots/shot'] = process.argv.slice(2);
const sizes = { portrait: { width: 390, height: 844 }, landscape: { width: 1280, height: 800 } };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let errors = 0;
for (const [name, viewport] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport, hasTouch: name === 'portrait' });
  page.on('console', (m) => m.type() === 'error' && (errors++, console.log(`[${name}] console.error:`, m.text())));
  page.on('pageerror', (e) => (errors++, console.log(`[${name}] pageerror:`, e.message)));
  await page.goto(url);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-${name}.png` });
  await page.close();
}
await browser.close();
console.log(errors ? `${errors} error(s)` : 'no console errors');
