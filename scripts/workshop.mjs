// Workshop check (needs `npm run dev`): opens Sliding blocks from Home, plays level 1 with real
// pointer drags (solution from a breadth-first search in the page), checks moves, the solved card,
// saved stars, unlock of level 2 and the way back Home. Screenshots in shots/workshop-*.png.
// Usage: node scripts/workshop.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
let errors = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
  if (!ok) failed++;
};

const page = await browser.newPage({ locale: 'en-US', viewport: { width: 390, height: 844 }, hasTouch: true });
page.on('console', (m) => m.type() === 'error' && (errors++, console.log('console.error:', m.text())));
page.on('pageerror', (e) => (errors++, console.log('pageerror:', e.message)));
await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('grain_tutorial_v1', '1');
});
await page.goto(url);
await page.waitForFunction(() => window.__grain);
await page.waitForTimeout(600);

await page.getByRole('button', { name: /Workshop/ }).click();
await page.waitForTimeout(300);
check('workshop hub opens', (await page.locator('.overlay.workshop-hub:not(.hidden)').count()) === 1);
await page.screenshot({ path: 'shots/workshop-0-hub.png' });
await page.getByRole('button', { name: /Sliding blocks/ }).click();
await page.waitForTimeout(300);
check('level list opens', await page.locator('.overlay.workshop:not(.hidden)').count() === 1);
await page.screenshot({ path: 'shots/workshop-1-levels.png' });
check('only level 1 is open', (await page.locator('.overlay.workshop:not(.hidden) .k-grid .stone:not([disabled])').count()) === 1);
await page.locator('.overlay.workshop:not(.hidden) .k-grid .stone').first().click();
await page.waitForTimeout(500);
check('level is on screen, Home hidden', await page.evaluate(() => {
  const k = window.__grain.game.klotski;
  return k.active && getComputedStyle(document.querySelector('.overlay.home')).display === 'none';
}));
await page.screenshot({ path: 'shots/workshop-2-level.png' });

// shortest solution as (piece id, dir, steps), found in the page with the game's own rules
const plan = await page.evaluate(() => {
  const k = window.__grain.game.klotski;
  const L = k.level;
  const dirs = ['up', 'down', 'left', 'right'];
  const key = (ps) => ps.map((p) => `${p.r},${p.c}`).join(';');
  const occ = (ps, skip) => {
    const g = new Array(L.w * L.h).fill(-1);
    for (const p of ps) if (p.id !== skip) for (let r = p.r; r < p.r + p.h; r++) for (let c = p.c; c < p.c + p.w; c++) g[r * L.w + c] = p.id;
    return g;
  };
  const D = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const room = (ps, p, d) => {
    const g = occ(ps, p.id);
    let n = 0;
    for (;;) {
      const r0 = p.r + D[d][0] * (n + 1);
      const c0 = p.c + D[d][1] * (n + 1);
      if (r0 < 0 || c0 < 0 || r0 + p.h > L.h || c0 + p.w > L.w) return n;
      for (let r = r0; r < r0 + p.h; r++) for (let c = c0; c < c0 + p.w; c++) if (g[r * L.w + c] !== -1) return n;
      n++;
    }
  };
  const start = k.pieces;
  const prev = new Map([[key(start), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const ps of frontier) {
      for (const p of ps)
        for (const d of dirs)
          for (let n = 1; n <= room(ps, p, d); n++) {
            const moved = ps.map((q) => (q.id === p.id ? { ...q, r: q.r + D[d][0] * n, c: q.c + D[d][1] * n } : q));
            const kk = key(moved);
            if (prev.has(kk)) continue;
            prev.set(kk, [key(ps), p.id, d, n, ps]);
            const kp = moved.find((q) => q.key);
            if (kp.r === L.exit.r && kp.c === L.exit.c) {
              const out = [];
              let cur = kk;
              while (prev.get(cur)) {
                const [pk, id, dd, nn] = prev.get(cur);
                out.unshift([id, dd, nn]);
                cur = pk;
              }
              return out;
            }
            next.push(moved);
          }
    }
    frontier = next;
  }
  return null;
});
check('level 1 has a solution', Array.isArray(plan), plan ? `${plan.length} moves` : '');

// screen point of a cell centre (on the block tops)
const screenOf = (r, c) =>
  page.evaluate(
    ([r, c]) => {
      const v = window.__grain.game.klotski.view;
      const THREE_V = v.camera.position.clone();
      THREE_V.set(v.cellX(c + 0.5), 0.04, v.cellZ(r + 0.5)).project(v.camera);
      return [((THREE_V.x + 1) / 2) * innerWidth, ((1 - THREE_V.y) / 2) * innerHeight];
    },
    [r, c],
  );
for (const [id, d, n] of plan ?? []) {
  const p = await page.evaluate((id) => window.__grain.game.klotski.pieces.find((q) => q.id === id), id);
  const [x0, y0] = await screenOf(p.r, p.c);
  const dr = d === 'up' ? -n : d === 'down' ? n : 0;
  const dc = d === 'left' ? -n : d === 'right' ? n : 0;
  const [x1, y1] = await screenOf(p.r + dr, p.c + dc);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(260);
}
await page.waitForTimeout(1400);
const after = await page.evaluate(() => {
  const k = window.__grain.game.klotski;
  return { moves: k.moves, win: k.win.open, saved: localStorage.getItem('grain_klotski_v1') };
});
check('moves counted', after.moves === (plan?.length ?? -1), `${after.moves}`);
check('solved card shows', after.win);
check('three stars saved', after.saved === JSON.stringify({ stars: [3], best: [plan?.length] }), after.saved ?? 'nothing');
await page.screenshot({ path: 'shots/workshop-3-solved.png' });

await page.getByRole('button', { name: 'Next level' }).click();
await page.waitForTimeout(400);
const k = () => page.evaluate(() => { const k = window.__grain.game.klotski; return { moves: k.moves, hinted: k.hinted, hist: k.history.length }; });
await page.getByRole('button', { name: 'Hint' }).click();
await page.waitForTimeout(700);
const h1 = await k();
check('hint plays one move', h1.moves === 1 && h1.hinted, JSON.stringify(h1));
await page.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(500);
const h2 = await k();
check('undo takes it back', h2.moves === 0 && h2.hist === 0, JSON.stringify(h2));
await page.screenshot({ path: 'shots/workshop-4-tools.png' });
await page.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(300);
check('level 2 unlocked', (await page.locator('.overlay.workshop:not(.hidden) .k-grid .stone:not([disabled])').count()) === 2);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape goes back to the hub', (await page.locator('.overlay.workshop-hub:not(.hidden)').count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('back on Home', await page.evaluate(() => {
  const k = window.__grain.game.klotski;
  return !k.active && !k.picker.open && !window.__grain.game.hub.open && getComputedStyle(document.querySelector('.overlay.home')).display !== 'none';
}));


// ---------- Plank fit ----------
await page.getByRole('button', { name: /Workshop/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Plank fit/ }).click();
await page.waitForTimeout(300);
await page.locator('.overlay.workshop:not(.hidden) .k-grid .stone').first().click();
await page.waitForTimeout(900);
check('plank level is on screen', await page.evaluate(() => window.__grain.game.plank.active));
await page.screenshot({ path: 'shots/workshop-5-plank.png' });
const proj = (x, z, y) =>
  page.evaluate(
    ([x, z, y]) => {
      const v = window.__grain.game.plank.view;
      const q = v.camera.position.clone().set(x, y, z).project(v.camera);
      return [((q.x + 1) / 2) * innerWidth, ((1 - q.y) / 2) * innerHeight];
    },
    [x, z, y],
  );
const topY = 0.04;
const pieces = await page.evaluate(() => {
  const m = window.__grain.game.plank;
  return m.level.pieces.map((p) => ({ id: p.id, sol: p.solution, cells: p.cells }));
});
for (const p of pieces) {
  const look = await page.evaluate((id) => ({ ...window.__grain.game.plank.look.get(id) }), p.id);
  const w = Math.max(...p.cells.map((c) => c[1])) + 1;
  const h = Math.max(...p.cells.map((c) => c[0])) + 1;
  const goal = await page.evaluate(([r, c, w, h]) => window.__grain.game.plank.view.cellCentre(r, c, w, h), [p.sol.r, p.sol.c, w, h]);
  const [x0, y0] = await proj(look.x, look.z, topY);
  const [x1, y1] = await proj(goal.x, goal.z, topY);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1300);
const pk = await page.evaluate(() => {
  const m = window.__grain.game.plank;
  return { placed: m.placed.length, total: m.level.pieces.length, win: m.win.open, saved: localStorage.getItem('grain_plank_v1') };
});
check('plank pieces placed by drag', pk.placed === pk.total, `${pk.placed}/${pk.total}`);
check('plank solved card', pk.win);
check('plank three stars saved', pk.saved === JSON.stringify({ stars: [3] }), pk.saved ?? 'nothing');
await page.screenshot({ path: 'shots/workshop-6-plank-solved.png' });

// level 2: tap turns a loose piece; a hint places one and costs a star
await page.getByRole('button', { name: 'Next level' }).click();
await page.waitForTimeout(900);
const before = await page.evaluate(() => {
  const m = window.__grain.game.plank;
  const p = m.level.pieces.find((q) => q.cells.length > 2) ?? m.level.pieces[0];
  return { id: p.id, cells: JSON.stringify(m.cells.get(p.id)), look: { ...m.look.get(p.id) } };
});
const [tx, ty] = await proj(before.look.x, before.look.z, 0);
await page.mouse.click(tx, ty);
await page.waitForTimeout(400);
const turned = await page.evaluate((id) => JSON.stringify(window.__grain.game.plank.cells.get(id)), before.id);
check('tap turns a loose piece', turned !== before.cells, `${before.cells} -> ${turned}`);
await page.getByRole('button', { name: 'Hint' }).click();
await page.waitForTimeout(500);
const hinted = await page.evaluate(() => ({ placed: window.__grain.game.plank.placed.length, hints: window.__grain.game.plank.hints }));
check('hint places a piece', hinted.placed === 1 && hinted.hints === 1, JSON.stringify(hinted));
await page.screenshot({ path: 'shots/workshop-7-plank-hint.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('plank: Escape leaves the level', await page.evaluate(() => !window.__grain.game.plank.active));


// ---------- memory: cycling levels must not grow GPU resources ----------
const mem = await page.evaluate(async () => {
  const g = window.__grain.game;
  const info = g.renderer.gl.info.memory;
  const wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = {};
  for (const [name, m] of [['klotski', g.klotski], ['plank', g.plank]]) {
    m.start(1);
    await wait();
    const a = { ...info };
    for (let n = 2; n <= 12; n++) {
      m.start(n);
      await wait();
    }
    m.start(1);
    await wait();
    out[name] = [a, { ...info }];
    m.leave(false);
  }
  return out;
});
for (const [name, [a, b]] of Object.entries(mem))
  check(`${name}: GPU memory flat after 12 levels`, b.geometries <= a.geometries && b.textures <= a.textures, `${JSON.stringify(a)} -> ${JSON.stringify(b)}`);

await browser.close();
console.log(errors ? `${errors} console error(s)` : 'no console errors');
if (failed || errors) {
  console.log(`${failed} check(s) FAILED`);
  process.exit(1);
}
console.log('all workshop checks passed');
