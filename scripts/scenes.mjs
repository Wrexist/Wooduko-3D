// Scripted screenshots for visual review (needs `npm run dev` running).
// Usage: node scripts/scenes.mjs [url] [outDir]
// For portrait (390×844) and landscape (1280×800) it captures:
//   1. empty board after "Play"
//   2. a drag in progress with ghost + clear preview
//   3. the middle of a multi-line clear (slow motion)
// Also prints console errors and renderer.info before/after.
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const sizes = { portrait: { width: 390, height: 844 }, landscape: { width: 1280, height: 800 } };

const seed = (i) => ({
  a: (i * 1.7) % 6.28,
  s: 0.9 + ((i * 0.13) % 0.3),
  jx: 0,
  jy: 0,
  t: 0.88 + ((i * 0.017) % 0.08),
});
const group = (cells, i) => {
  const cx = cells.reduce((a, p) => a + p[1], 0) / cells.length + 0.5;
  const cy = cells.reduce((a, p) => a + p[0], 0) / cells.length + 0.5;
  return { cells, center: [cx, cy], seed: seed(i) };
};
const run = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => [r, c0 + i]);

// Rows 6 and 7 are full except column 0; box 6 is full except (6,0),(7,0).
// A vertical i2 at (6,0) clears row 6 + row 7 + box 6 → 3 units, at streak 2.
const scenario = {
  version: 1,
  score: 412,
  streak: 1,
  rng: 12345,
  groups: [
    group(run(6, 1, 4), 1),
    group(run(6, 5, 8), 2),
    group(run(7, 1, 3), 3),
    group(run(7, 4, 8), 4),
    group(run(8, 0, 2), 5),
    group(
      [
        [2, 2],
        [2, 3],
        [3, 3],
      ],
      6,
    ),
    group(
      [
        [1, 6],
        [1, 7],
      ],
      7,
    ),
    group(
      [
        [4, 7],
        [5, 7],
        [5, 8],
      ],
      8,
    ),
  ],
  tray: [
    { shapeIndex: 2, seed: seed(9) }, // vertical i2
    { shapeIndex: 13, seed: seed(10) }, // o4
    { shapeIndex: 22, seed: seed(11) }, // t4
  ],
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let errors = 0;

async function open(name, viewport, save) {
  const page = await browser.newPage({ viewport });
  page.on(
    'console',
    (m) => m.type() === 'error' && (errors++, console.log(`[${name}] console.error:`, m.text())),
  );
  page.on('pageerror', (e) => (errors++, console.log(`[${name}] pageerror:`, e.message)));
  await page.addInitScript(
    (s) => {
      localStorage.clear();
      localStorage.setItem('grain_tutorial_v1', '1');
      localStorage.setItem('grain_settings_v1', JSON.stringify({ sound: false, music: false }));
      if (s) localStorage.setItem('grain_save_v1', s);
    },
    save ? JSON.stringify(save) : null,
  );
  await page.goto(url);
  await page.waitForFunction(() => window.__grain);
  return page;
}

const gameClock = (page) => page.evaluate(() => window.__grain.game.debug.clock);
async function waitGame(page, seconds) {
  const t0 = await gameClock(page);
  await page.waitForFunction((t) => window.__grain.game.debug.clock >= t, t0 + seconds, { timeout: 120000 });
}
const screen = (page, x, y, z) =>
  page.evaluate(
    ([x, y, z]) => window.__grain.game.world.toScreen(x, y, z, innerWidth, innerHeight),
    [x, y, z],
  );

for (const [name, viewport] of Object.entries(sizes)) {
  // 1. empty board
  let page = await open(name, viewport, null);
  await page.getByRole('button', { name: 'Play' }).click();
  await waitGame(page, 1.2);
  await page.screenshot({ path: `${out}/${name}-1-empty.png` });
  const info0 = await page.evaluate(() => ({ ...window.__grain.game.debug.info.memory }));
  await page.close();

  // 2. drag in progress
  page = await open(name, viewport, scenario);
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitGame(page, 1.0);
  const slot = await page.evaluate(() => {
    const w = window.__grain.game.world;
    const p = w.slotPos(0, w.camBase.clone());
    return w.toScreen(p.x, 0, p.z, innerWidth, innerHeight);
  });
  const target = await screen(page, -4, -0.94, 2.5);
  await page.mouse.move(slot.x, slot.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(slot.x + ((target.x - slot.x) * i) / 8, slot.y + ((target.y - slot.y) * i) / 8);
    await waitGame(page, 0.03);
  }
  await waitGame(page, 0.6);
  await page.screenshot({ path: `${out}/${name}-2-drag.png` });

  // 3. mid clear, slow motion
  await page.evaluate(() => (window.__grain.game.timeScale = 0.35));
  const seq = await page.evaluate(() => window.__grain.store.getState().moveSeq);
  await page.mouse.up();
  await page.waitForFunction((s) => window.__grain.store.getState().moveSeq > s, seq, { timeout: 120000 });
  await waitGame(page, 0.09);
  await page.screenshot({ path: `${out}/${name}-3-clear.png` });
  await page.evaluate(() => (window.__grain.game.timeScale = 1));
  await waitGame(page, 2.5);
  const info1 = await page.evaluate(() => ({ ...window.__grain.game.debug.info.memory }));
  console.log(`[${name}] memory empty-board:`, info0, 'after clear settled:', info1);
  await page.close();
}

await browser.close();
console.log(errors ? `${errors} error(s)` : 'no console errors');
