import { chromium } from 'playwright';
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
  ],
  tray: [{ shapeIndex: 13, seed: seed(2) }, null, null],
};
await page.addInitScript((s) => {
  localStorage.clear();
  localStorage.setItem('grain_tutorial_v1', '1');
  localStorage.setItem('grain_save_v1', s);
}, JSON.stringify(save));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__grain);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(2000);
const clip = { x: 560, y: 220, width: 260, height: 120 };
await page.screenshot({ path: 'shots/dbg-a.png', clip });
await page.evaluate(() => {
  for (const m of window.__grain.game.world.groups.values()) m.receiveShadow = false;
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/dbg-b.png', clip });
await page.evaluate(() => {
  for (const m of window.__grain.game.world.groups.values()) {
    m.receiveShadow = true;
    m.material[0].normalMap = null;
    m.material[0].map = null;
    m.material[0].needsUpdate = true;
  }
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/dbg-c.png', clip });
await b.close();
