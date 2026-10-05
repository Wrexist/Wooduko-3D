// Screen-size check (needs `npm run dev` running).
// Usage: node scripts/layout.mjs [url] [outDir]
// For phones, tablets and desktops (both orientations) it loads a game whose tray holds the
// widest pieces and checks: board + tray are fully on screen and below the HUD, HUD elements
// don't overlap, and the toast, tutorial tip and every card fit the viewport.
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const VIEWPORTS = {
  'se1-320x568': [320, 568],
  'se1-land-568x320': [568, 320],
  'se2-375x667': [375, 667],
  'android-360x740': [360, 740],
  'iphone-390x844': [390, 844],
  'promax-430x932': [430, 932],
  'phone-land-844x390': [844, 390],
  'ipad-768x1024': [768, 1024],
  'ipad-land-1024x768': [1024, 768],
  'ipadair-820x1180': [820, 1180],
  'ipadpro-land-1366x1024': [1366, 1024],
  'split-600x600': [600, 600],
  'desktop-1920x1080': [1920, 1080],
};
const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
// i5 horizontal, i5 vertical, plus: the widest/tallest footprints in each slot
const save = {
  version: 1,
  score: 98765,
  streak: 3,
  rng: 4,
  groups: [
    {
      cells: [
        [0, 0],
        [0, 1],
      ],
      center: [1, 0.5],
      seed,
    },
  ],
  tray: [
    { shapeIndex: 7, seed },
    { shapeIndex: 8, seed },
    { shapeIndex: 34, seed },
  ],
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
let errors = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  if (!ok || process.env.VERBOSE)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

for (const [name, [width, height]] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => (errors++, console.log(`[${name}] pageerror:`, e.message)));
  page.on('console', (m) => m.type() === 'error' && (errors++, console.log(`[${name}]`, m.text())));
  await page.addInitScript((s) => {
    localStorage.clear();
    localStorage.setItem('grain_tutorial_v1', '1');
    localStorage.setItem('grain_best_v1', '123456');
    localStorage.setItem('grain_save_v1', s);
  }, JSON.stringify(save));
  await page.goto(url);
  await page.waitForFunction(() => window.__grain);
  await page.waitForTimeout(300);

  // home card
  const homeFits = await page.evaluate(() => {
    const r = document.querySelector('.home .card').getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  });
  check(`${name}: home card fits`, homeFits);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(800);

  const geo = await page.evaluate(() => {
    const { game } = window.__grain;
    const w = game.world;
    const W = innerWidth;
    const H = innerHeight;
    const hudBottom = document.querySelector('.hud').getBoundingClientRect().bottom;
    const pts = [];
    // board: the carved hole in the table
    for (const x of [-4.9, 4.9]) for (const z of [-4.9, 4.9]) pts.push(['board', w.toScreen(x, 0, z, W, H)]);
    // tray pieces: bounding box at full hover height and scale
    for (const t of w.tray) {
      if (!t) continue;
      const s = 0.62 * 1.07;
      const p = w.slotPos(t.slot, t.pivot.position.clone());
      for (const dx of [-1, 1])
        for (const dz of [-1, 1])
          for (const y of [0, 0.22 + 0.98 * s])
            pts.push([
              `tray${t.slot}`,
              w.toScreen(p.x + (dx * t.shape.w * s) / 2, y, p.z + (dz * t.shape.h * s) / 2, W, H),
            ]);
    }
    const off = pts
      .filter(([, q]) => q.x < 0 || q.x > W || q.y < hudBottom || q.y > H)
      .map(([n, q]) => `${n}@${q.x | 0},${q.y | 0}`);
    // HUD: score text must not run under the side buttons
    const btns = [...document.querySelectorAll('.hud .btn')]
      .filter((b) => b.offsetParent)
      .map((b) => b.getBoundingClientRect());
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.score'));
    const sr = range.getBoundingClientRect();
    const btnOff = btns.some((b) => b.left < 0 || b.right > W || b.top < 0);
    const hudOverlap =
      btnOff ||
      btns.some(
        (b) => !(sr.right <= b.left || sr.left >= b.right || sr.bottom <= b.top || sr.top >= b.bottom),
      );
    return { off, hudOverlap, hudBottom };
  });
  check(`${name}: board + tray on screen and below HUD`, geo.off.length === 0, geo.off.slice(0, 4).join(' '));
  check(`${name}: HUD score clear of buttons`, !geo.hudOverlap);

  // toast: the longest, biggest word
  const toastFits = await page.evaluate(() => {
    window.__grain.game.toast.show('Board clear!', 'Combo ×12', innerHeight * 0.4, 4);
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.toast .big'));
    const r = range.getBoundingClientRect();
    return r.width <= innerWidth;
  });
  check(`${name}: toast fits`, toastFits);
  await page.screenshot({ path: `${out}/layout-${name}.png` });

  // cards: pause, settings, confirm, results
  for (const [label, open] of [
    ['pause', () => window.__grain.store.getState().pause()],
    ['settings', () => window.__grain.game.settingsPanel.show()],
    [
      'confirm',
      () =>
        void window.__grain.game.confirm.ask({
          title: 'Start over?',
          body: 'Your current board and score will be lost.',
          confirm: 'Restart',
        }),
    ],
    ['results', () => window.__grain.game.results.present(98765, 123456, true, window.__grain.game.tweens)],
    ['awards', () => window.__grain.game.showAwards()],
  ]) {
    await page.evaluate(open);
    await page.waitForTimeout(500);
    const fits = await page.evaluate((l) => {
      const sel = {
        pause: '.pause',
        settings: '.settings',
        confirm: '.confirm-layer',
        results: '.results',
        awards: '.awards',
      }[l];
      const ov = document.querySelector(sel);
      const r = ov.querySelector('.card').getBoundingClientRect();
      // either it fits, or the overlay scrolls so every part can be reached
      const scrolls = ov.scrollHeight > ov.clientHeight && getComputedStyle(ov).overflowY !== 'visible';
      return {
        fits: (r.top >= 0 && r.bottom <= innerHeight) || scrolls,
        wide: r.left >= 0 && r.right <= innerWidth,
      };
    }, label);
    check(`${name}: ${label} card reachable`, fits.fits && fits.wide, JSON.stringify(fits));
    if (label === 'settings' && name.includes('320'))
      await page.screenshot({ path: `${out}/layout-${name}-settings.png` });
    await page.evaluate(() => {
      const g = window.__grain.game;
      g.confirm.cancel();
      g.settingsPanel.hide();
      g.results.hide();
      g.awards.hide();
      window.__grain.store.getState().resume();
    });
  }

  // tutorial tip leaves room for the board
  await page.evaluate(() => window.__grain.game.startTutorial());
  await page.waitForTimeout(600);
  const tut = await page.evaluate(() => {
    const w = window.__grain.game.world;
    const tip = document.querySelector('.tutorial .tip').getBoundingClientRect();
    const corners = [-4.9, 4.9].flatMap((x) =>
      [-4.9, 4.9].map((z) => w.toScreen(x, 0, z, innerWidth, innerHeight)),
    );
    const boardTop = Math.min(...corners.map((c) => c.y));
    const boardLeft = Math.min(...corners.map((c) => c.x));
    const boardRight = Math.max(...corners.map((c) => c.x));
    const overlaps = !(tip.bottom <= boardTop || tip.right <= boardLeft || tip.left >= boardRight);
    return { overlaps, boardHeight: Math.max(...corners.map((c) => c.y)) - boardTop };
  });
  check(`${name}: tutorial tip clear of the board`, !tut.overlaps, JSON.stringify(tut));
  if (name.startsWith('se1')) await page.screenshot({ path: `${out}/layout-${name}-tutorial.png` });
  await page.close();
}

await browser.close();
console.log(errors ? `${errors} console error(s)` : 'no console errors');
console.log(failed ? `${failed} layout check(s) FAILED` : 'all layout checks passed');
process.exit(failed || errors ? 1 : 0);
