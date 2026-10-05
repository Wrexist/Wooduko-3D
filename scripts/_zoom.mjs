import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
const save = {
  version: 1,
  score: 10,
  streak: 0,
  rng: 5,
  groups: [
    {
      cells: [
        [1, 6],
        [1, 7],
      ],
      center: [7, 2],
      seed,
    },
    {
      cells: [
        [4, 2],
        [4, 3],
        [4, 4],
      ],
      center: [3.5, 4.5],
      seed: { ...seed, a: 0 },
    },
  ],
  tray: [{ shapeIndex: 0, seed }, null, null],
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
await page.screenshot({ path: 'shots/zoom.png', clip: { x: 300, y: 200, width: 480, height: 260 } });
await b.close();
