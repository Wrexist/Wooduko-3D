// App Store screenshots from the real game (needs `npm run dev` running).
// Usage: node scripts/store-shots.mjs [url]
// Writes store/<lang>/<device>-<n>.png at Apple's sizes (opaque RGB):
//   iphone69 1320×2868 · iphone63 1206×2622 · iphone65 1242×2688 · ipad13 2064×2752
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { pngToRgb } from './png-rgb.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const DEVICES = {
  iphone69: { size: [1320, 2868], game: [390, 760], scale: 3 },
  iphone63: { size: [1206, 2622], game: [390, 760], scale: 3 },
  iphone65: { size: [1242, 2688], game: [390, 760], scale: 3 },
  ipad13: { size: [2064, 2752], game: [860, 1000], scale: 2 },
};
const CAPTIONS = {
  en: [
    'Satisfying clears',
    'See every clear before you drop',
    'Chain combos, clear the board',
    'Unlock eight woods',
    'Calm. Offline. No timers.',
  ],
  sv: [
    'Rensningar som känns',
    'Se rensningen innan du släpper',
    'Bygg kombos, töm brädan',
    'Lås upp åtta träslag',
    'Lugnt. Offline. Ingen stress.',
  ],
};
const LOCALES = { en: 'en-US', sv: 'sv-SE' };

const seed = (i) => ({
  a: (i * 1.7) % 6.28,
  s: 0.9 + ((i * 0.13) % 0.3),
  jx: 0,
  jy: 0,
  t: 0.88 + ((i * 0.017) % 0.08),
});
const grp = (cells, i) => ({
  cells,
  center: [
    cells.reduce((a, p) => a + p[1], 0) / cells.length + 0.5,
    cells.reduce((a, p) => a + p[0], 0) / cells.length + 0.5,
  ],
  seed: seed(i),
});
const run = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => [r, c0 + i]);
const base = { version: 3, misses: 0, sinceSmall: 0, revives: 0, rng: 7 };
// rows 6–7 + box 6 complete with a vertical domino at (6,0): a triple clear
const TRIPLE = {
  ...base,
  score: 2412,
  streak: 1,
  groups: [
    grp(run(6, 1, 4), 1),
    grp(run(6, 5, 8), 2),
    grp(run(7, 1, 3), 3),
    grp(run(7, 4, 8), 4),
    grp(run(8, 0, 2), 5),
    grp(
      [
        [2, 2],
        [2, 3],
        [3, 3],
      ],
      6,
    ),
    grp(
      [
        [1, 6],
        [1, 7],
      ],
      7,
    ),
    grp(
      [
        [4, 7],
        [5, 7],
        [5, 8],
      ],
      8,
    ),
  ],
  tray: [
    { shapeIndex: 2, seed: seed(9) },
    { shapeIndex: 13, seed: seed(10) },
    { shapeIndex: 22, seed: seed(11) },
  ],
};
// one row short of empty: a board clear at streak 2
const BOARD_CLEAR = {
  ...base,
  score: 5180,
  streak: 2,
  groups: [grp(run(8, 0, 3), 1), grp(run(8, 4, 7), 2)],
  tray: [
    { shapeIndex: 0, seed: seed(3) },
    { shapeIndex: 22, seed: seed(4) },
    { shapeIndex: 9, seed: seed(5) },
  ],
};
const ALL_ACH = Object.fromEntries(
  [
    'first-clear',
    'combo-3',
    'combo-5',
    'triple',
    'quad',
    'board-clear',
    'score-1k',
    'score-5k',
    'score-10k',
    'games-10',
    'lines-500',
  ].map((k) => [k, 1]),
);
const STATS = {
  gamesPlayed: 48,
  totalScore: 151200,
  bestScore: 14820,
  linesCleared: 1290,
  bestCombo: 9,
  boardClears: 6,
  biggestClear: 5,
  piecesPlaced: 5210,
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function gamePage(lang, dev, save, opts = {}) {
  const extra = { ach: ALL_ACH, stats: STATS, ...opts };
  const [w, h] = DEVICES[dev].game;
  const page = await browser.newPage({
    locale: LOCALES[lang],
    viewport: { width: w, height: h },
    deviceScaleFactor: DEVICES[dev].scale,
  });
  await page.addInitScript(
    ([s, x]) => {
      localStorage.clear();
      localStorage.setItem('grain_tutorial_v1', '1');
      localStorage.setItem('grain_best_v1', '14820');
      localStorage.setItem(
        'grain_settings_v1',
        JSON.stringify({ sound: false, music: false, theme: x.theme ?? 'maple' }),
      );
      // everything already earned, so no achievement banner pops into a screenshot
      localStorage.setItem('grain_achievements_v1', JSON.stringify(x.ach));
      localStorage.setItem('grain_stats_v1', JSON.stringify(x.stats));
      if (s) localStorage.setItem('grain_save_v1', s);
    },
    [save ? JSON.stringify(save) : null, extra],
  );
  await page.goto(url);
  await page.waitForFunction(() => window.__grain);
  // CSS callouts run in real time while the game is slowed down: freeze them at their peak frame
  await page.addStyleTag({
    content:
      '.toast.show{animation-delay:-0.3s!important;animation-play-state:paused!important}.flash.on{animation-delay:-0.08s!important;animation-play-state:paused!important}',
  });
  if (save) {
    await page.locator('.home .cta').first().click();
    await waitGame(page, 1.2); // game time: at 3x the software renderer runs slower than real time
  }
  return page;
}
const clock = (p) => p.evaluate(() => window.__grain.game.debug.clock);
async function waitGame(p, s) {
  const t0 = await clock(p);
  await p.waitForFunction((t) => window.__grain.game.debug.clock >= t, t0 + s, { timeout: 120000 });
}
const toScreen = (p, x, y, z) =>
  p.evaluate(([x, y, z]) => window.__grain.game.world.toScreen(x, y, z, innerWidth, innerHeight), [x, y, z]);
const slot = (p, i) =>
  p.evaluate((i) => {
    const w = window.__grain.game.world;
    const s = w.slotPos(i, w.camBase.clone());
    return w.toScreen(s.x, 0, s.z, innerWidth, innerHeight);
  }, i);
async function dragTo(p, from, to, release) {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await p.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
    await waitGame(p, 0.03);
  }
  await waitGame(p, 0.6);
  if (!release) return;
  await p.evaluate(() => (window.__grain.game.timeScale = 0.3));
  const seq = await p.evaluate(() => window.__grain.store.getState().moveSeq);
  await p.mouse.up();
  await p.waitForFunction((s) => window.__grain.store.getState().moveSeq > s, seq, { timeout: 120000 });
  await waitGame(p, 0.11);
}

const SCENES = [
  // 1 triple clear mid-burst
  async (lang, dev) => {
    const p = await gamePage(lang, dev, TRIPLE);
    await dragTo(p, await slot(p, 0), await toScreen(p, -4, -0.94, 2.5), true);
    return p;
  },
  // 2 dragging with the gold preview
  async (lang, dev) => {
    const p = await gamePage(lang, dev, TRIPLE);
    await dragTo(p, await slot(p, 0), await toScreen(p, -4, -0.94, 2.5), false);
    return p;
  },
  // 3 board clear
  async (lang, dev) => {
    const p = await gamePage(lang, dev, BOARD_CLEAR);
    await dragTo(p, await slot(p, 0), await toScreen(p, 4, -0.94, 4), true);
    await waitGame(p, 0.08);
    return p;
  },
  // 4 awards with every wood
  async (lang, dev) => {
    const p = await gamePage(lang, dev, TRIPLE, { ach: ALL_ACH, stats: STATS, theme: 'walnut' });
    await p.evaluate(() => window.__grain.game.showAwards());
    await p.waitForTimeout(700);
    return p;
  },
  // 5 a calm game in walnut
  async (lang, dev) => {
    const p = await gamePage(lang, dev, { ...TRIPLE, score: 3260 }, { ach: ALL_ACH, theme: 'walnut' });
    await waitGame(p, 0.5);
    return p;
  },
];

async function compose(shot, caption, dev, out) {
  const [W, H] = DEVICES[dev].size;
  const font = readFileSync('public/fonts/fraunces-latin-800-normal.woff2').toString('base64');
  const img = shot.toString('base64');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const capSize = Math.round(W * 0.068);
  await page.setContent(`<style>
    @font-face{font-family:F;src:url(data:font/woff2;base64,${font})}
    body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(120% 80% at 50% 0%,#5a3820,#26170d 70%);
      display:flex;flex-direction:column;align-items:center}
    h1{margin:${Math.round(H * 0.045)}px ${Math.round(W * 0.07)}px ${Math.round(H * 0.03)}px;font:800 ${capSize}px/1.12 F;color:#fff6e6;text-align:center;
      text-shadow:0 ${Math.round(capSize * 0.06)}px 0 rgba(60,30,12,.6)}
    img{width:${Math.round(W * 0.86)}px;border-radius:${Math.round(W * 0.05)}px;box-shadow:0 ${Math.round(W * 0.03)}px ${Math.round(W * 0.08)}px rgba(0,0,0,.55)}
  </style><h1>${caption}</h1><img src="data:image/png;base64,${img}">`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot();
  await page.close();
  writeFileSync(out, pngToRgb(png));
}

for (const lang of Object.keys(CAPTIONS)) {
  mkdirSync(`store/${lang}`, { recursive: true });
  for (const dev of Object.keys(DEVICES)) {
    for (let i = 0; i < SCENES.length; i++) {
      const page = await SCENES[i](lang, dev);
      const shot = await page.screenshot();
      await page.close();
      const out = `store/${lang}/${dev}-${i + 1}.png`;
      await compose(shot, CAPTIONS[lang][i], dev, out);
      console.log('wrote', out);
    }
  }
}
await browser.close();
