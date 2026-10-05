import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
const save = {
  version: 1,
  score: 10,
  streak: 0,
  rng: 5,
  groups: [
    {
      cells: [
        [6, 1],
        [6, 2],
        [6, 3],
        [6, 4],
        [6, 5],
        [6, 6],
        [6, 7],
        [6, 8],
      ],
      center: [5, 6.5],
      seed,
    },
  ],
  tray: [
    { shapeIndex: 0, seed },
    { shapeIndex: 0, seed },
    { shapeIndex: 0, seed },
  ],
};
await page.addInitScript((s) => {
  localStorage.clear();
  localStorage.setItem('grain_tutorial_v1', '1');
  localStorage.setItem('grain_save_v1', s);
}, JSON.stringify(save));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__grain);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(1500);
const slot = await page.evaluate(() => {
  const w = window.__grain.game.world;
  const p = w.slotPos(0, w.camBase.clone());
  return w.toScreen(p.x, 0, p.z, innerWidth, innerHeight);
});
const target = await page.evaluate(() =>
  window.__grain.game.world.toScreen(-4, -0.94, 2, innerWidth, innerHeight),
);
await page.mouse.move(slot.x, slot.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(slot.x + ((target.x - slot.x) * i) / 8, slot.y + ((target.y - slot.y) * i) / 8);
  await page.waitForTimeout(50);
}
await page.waitForTimeout(800);
console.log(
  await page.evaluate(() => {
    const g = window.__grain.game;
    const d = g.drag.drag;
    const p = g.preview;
    return {
      d: d && { valid: d.valid, r0: d.r0, c0: d.c0 },
      tgt: Array.from(p.glowTarget)
        .map((v, i) => (v ? i : -1))
        .filter((i) => i >= 0),
      op: p.glows.filter((x) => x.visible).map((x) => x.material.opacity.toFixed(2)),
      ghost: p.ghost && {
        show: p.ghost.show,
        op: p.ghost.mesh.material.opacity,
        vis: p.ghost.pivot.visible,
        pos: p.ghost.pivot.position,
      },
    };
  }),
);
await page.screenshot({ path: 'shots/dbg.png' });
await b.close();
