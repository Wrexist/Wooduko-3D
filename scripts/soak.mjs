// GPU resource leak check (needs `npm run dev` running).
// Usage: node scripts/soak.mjs [moves] [url]
// Plays `moves` legal moves through the real commit + FX path (restarting on game over) and
// checks that renderer.info.memory geometry/texture counts come back to the same level.
import { chromium } from 'playwright';

const moves = Number(process.argv[2] ?? 200);
const url = process.argv[3] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let errors = 0;
page.on('pageerror', (e) => (errors++, console.log('pageerror:', e.message)));
page.on('console', (m) => m.type() === 'error' && (errors++, console.log('console.error:', m.text())));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('grain_tutorial_v1', '1');
  localStorage.setItem('grain_settings_v1', JSON.stringify({ sound: false, music: false }));
});
await page.goto(url);
await page.waitForFunction(() => window.__grain);
await page.getByRole('button', { name: 'Play' }).click();

const settle = async () => {
  await page.waitForFunction(() => window.__grain.game.debug.tweens === 0, null, { timeout: 120000 });
  await page.waitForTimeout(300);
};
const mem = () =>
  page.evaluate(() => {
    const { geometries, textures } = window.__grain.game.debug.info.memory;
    const s = window.__grain.store.getState();
    const groups = s.game.board.groups.length;
    const tray = s.game.tray.filter(Boolean).length;
    return { geometries, textures, groups, tray };
  });

await settle();
const start = await mem();
let games = 1;
for (let i = 0; i < moves; i++) {
  const r = await page.evaluate(() => {
    const { store, game } = window.__grain;
    const s = store.getState();
    if (s.phase === 'over') {
      s.startNew();
      return 'restart';
    }
    const w = game.world;
    for (const tp of w.tray) {
      if (!tp || tp.anim) continue;
      const cand = [];
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cand.push([r, c]);
      cand.sort(() => Math.random() - 0.5);
      for (const [r, c] of cand) {
        const ok = tp.shape.cells.every(([a, b]) => {
          const rr = a + r;
          const cc = b + c;
          return rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && s.game.board.grid[rr][cc] === 0;
        });
        if (ok) {
          tp.anim = true;
          game.commit(tp, r, c);
          return 'move';
        }
      }
    }
    return 'stuck';
  });
  if (r === 'restart') games++;
  await page.waitForTimeout(40);
}
await settle();
const end = await mem();
await browser.close();

// geometries scale with live meshes: one per placed group + tray piece, plus a fixed scene base
const base = (m) => m.geometries - m.groups - m.tray;
console.log('start', start, 'end', end, `games ${games}`);
const ok = base(start) === base(end) && start.textures === end.textures;
console.log(ok ? 'PASS  no GPU resource growth' : 'FAIL  geometry/texture count grew');
console.log(errors ? `${errors} console error(s)` : 'no console errors');
process.exit(ok && !errors ? 0 : 1);
