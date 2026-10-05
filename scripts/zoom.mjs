// Close-up screenshot of blocks for material review (needs `npm run dev`).
// Usage: node scripts/zoom.mjs [out.png]
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'shots/zoom.png';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const seed = (a) => ({ a, s: 1, jx: 0, jy: 0, t: 0.9 });
const save = {
  version: 2,
  score: 10,
  streak: 0,
  misses: 0,
  sinceSmall: 0,
  rng: 5,
  groups: [
    {
      cells: [
        [1, 6],
        [1, 7],
      ],
      center: [7, 2],
      seed: seed(1),
    },
    {
      cells: [
        [4, 2],
        [4, 3],
        [4, 4],
        [5, 4],
      ],
      center: [3.5, 4.8],
      seed: seed(0.3),
    },
  ],
  tray: [{ shapeIndex: 13, seed: seed(2) }, { shapeIndex: 22, seed: seed(4) }, null],
};
await page.addInitScript((s) => {
  localStorage.clear();
  localStorage.setItem('grain_tutorial_v1', '1');
  localStorage.setItem('grain_save_v1', s);
}, JSON.stringify(save));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__grain);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: out, clip: { x: 300, y: 200, width: 800, height: 420 } });
await b.close();
