// Leak / stability soak (needs `npm run dev` running).
// Usage: node scripts/soak.mjs [moves | <N>m] [url]
//   node scripts/soak.mjs 200     → 200 moves
//   node scripts/soak.mjs 30m     → keep playing for 30 minutes
// Plays legal moves through the real commit + FX path (restarting on game over). Every sample
// waits for all animation to settle, forces GC, and records GPU resources (geometries per live
// mesh, textures, shader programs), JS heap, DOM node count and running tweens. Fails if any of
// them grows between the first warmed-up sample and the last.
import { chromium } from 'playwright';

const arg = process.argv[2] ?? '200';
const url = process.argv[3] ?? 'http://localhost:5173/';
const minutes = arg.endsWith('m') ? Number(arg.slice(0, -1)) : 0;
const maxMoves = minutes ? Infinity : Number(arg);
const deadline = Date.now() + minutes * 60_000;
const SAMPLE_EVERY = minutes ? 150 : 50;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ locale: 'en-US', viewport: { width: 390, height: 844 } });
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

async function sample() {
  await page.waitForFunction(() => window.__grain.game.debug.tweens === 0, null, { timeout: 120000 });
  await page.waitForTimeout(2400); // float texts, crown and toasts finish their CSS animations
  return page.evaluate(() => {
    window.gc?.();
    const { info } = window.__grain.game.debug;
    const s = window.__grain.store.getState();
    const live = s.game.board.groups.length + s.game.tray.filter(Boolean).length;
    return {
      baseGeo: info.memory.geometries - live,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e5) / 10,
      dom: document.getElementsByTagName('*').length,
    };
  });
}

const samples = [];
let moves = 0;
let games = 1;
const t0 = Date.now();
samples.push(await sample());
while (moves < maxMoves && (!minutes || Date.now() < deadline)) {
  const r = await page.evaluate(() => {
    const { store, game } = window.__grain;
    const s = store.getState();
    if (s.phase === 'over') {
      s.startNew();
      return 'restart';
    }
    for (const tp of game.world.tray) {
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
  else moves++;
  await page.waitForTimeout(40);
  if (moves > 0 && moves % SAMPLE_EVERY === 0) {
    const s = await sample();
    samples.push(s);
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`${mins} min  moves ${moves}  games ${games}`, JSON.stringify(s));
  }
}
samples.push(await sample());
await browser.close();

// compare the first warmed-up sample (after the first batch, when every FX has run once) to the last
const first = samples[Math.min(1, samples.length - 1)];
const last = samples[samples.length - 1];
console.log('first', JSON.stringify(first));
console.log('last ', JSON.stringify(last));
const heapGrowth = first.heapMB ? (last.heapMB - first.heapMB) / first.heapMB : 0;
const checks = [
  ['geometries flat', last.baseGeo <= first.baseGeo],
  ['textures flat', last.textures <= first.textures],
  ['shader programs flat', last.programs <= first.programs],
  ['DOM nodes flat', last.dom <= first.dom],
  [`JS heap flat (${(heapGrowth * 100).toFixed(1)}%)`, heapGrowth < 0.15],
];
let ok = !errors;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  ok &&= pass;
}
console.log(`moves ${moves}, games ${games}, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
console.log(errors ? `${errors} console error(s)` : 'no console errors');
process.exit(ok ? 0 : 1);
