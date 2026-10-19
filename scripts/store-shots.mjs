// App Store screenshots and banners from the real game (needs `npm run dev` running).
// Usage: node scripts/store-shots.mjs [url]   (env: LANGS=en,sv  DEVICES=iphone69,duo  ONLY=1,2)
// Writes store/<lang>/<device>-<n>.png at Apple's sizes (opaque RGB):
//   iphone69 1320×2868 · iphone63 1206×2622 · iphone65 1242×2688 · ipad13 2064×2752
//   duo 2007×2853 (iPhone Duo, inner display: the game captured at the inner display's shape)
// plus header-1920x1080.png (featuring / in-app event card), play-feature-1024x500.png (Google
// Play feature graphic) and search-preview.png (how the first three look in App Store search).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { pngToRgb } from './png-rgb.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const DEVICES = {
  iphone69: { size: [1320, 2868], game: [390, 760], scale: 3 },
  iphone63: { size: [1206, 2622], game: [390, 760], scale: 3 },
  iphone65: { size: [1242, 2688], game: [390, 760], scale: 3 },
  ipad13: { size: [2064, 2752], game: [860, 1000], scale: 2 },
  duo: { size: [2007, 2853], game: [626, 890], scale: 3 },
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
      for (const [k, v] of Object.entries(x.local ?? {})) localStorage.setItem(k, v);
      // Journey: levels 1-11 done with stars, 12 next
      localStorage.setItem('grain_journey_v1', JSON.stringify({ stars: [3, 3, 2, 3, 3, 2, 3, 3, 1, 3, 2] }));
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

// ---------- scenes ----------
/** Open the Workshop hub (from Home). */
async function openHub(p) {
  await p.locator('.workshop-btn').click();
  await p.waitForTimeout(700);
}
/** Open a Workshop game's level list and play level `n` (or the next one). */
async function playWorkshop(p, id, n) {
  await openHub(p);
  await p.locator(`.hub-game[data-game="${id}"]`).click();
  await p.waitForTimeout(700);
  await p.evaluate((n) => {
    const ls = [...document.querySelectorAll('.overlay.workshop:not(.hidden) .k-level:not([disabled])')];
    (ls[n - 1] ?? ls[0])?.click();
  }, n ?? 1);
}

/**
 * Each scene: what to show, its accent colour, a small tag, a headline (the *word* is
 * highlighted) and an optional sticker. The first three are the ones App Store search shows.
 */
const SCENES = [
  {
    id: 'clears',
    accent: '#f0b94a',
    en: { tag: 'Wood block puzzle', head: 'Satisfying *clears*', badge: 'Combo ×2' },
    sv: { tag: 'Träklosspussel', head: 'Rensningar som *känns*', badge: 'Kombo ×2' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, TRIPLE);
      await dragTo(p, await slot(p, 0), await toScreen(p, -4, -0.94, 2.5), true);
      return p;
    },
  },
  {
    id: 'chess',
    accent: '#3fe0b4',
    en: { tag: 'Chess with a coach', head: 'Learn the *best move*', badge: 'Your coach' },
    sv: { tag: 'Schack med coach', head: 'Lär dig *bästa draget*', badge: 'Din coach' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, null, { local: { grain_chess_view: 'top' } });
      await openHub(p);
      await p.evaluate(async () => {
        const g = window.__grain.game;
        const ch = await import('/src/core/chess.ts');
        const c = g.chess;
        g.hub.hide();
        c.start(4);
        for (const n of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']) {
          const m = ch.legalMoves(c.pos).find((x) => ch.moveName(x) === n);
          ch.makeMove(c.pos, m);
          c.moves.push(m);
        }
        c.view.sync(c.board64());
        c.beginTurn();
      });
      await p.waitForTimeout(600);
      await p.locator('.k-teach:visible').click();
      await p.waitForFunction(() => window.__grain.game.chess.teachMove, null, { timeout: 60000 });
      await p.waitForTimeout(1500);
      return p;
    },
  },
  {
    id: 'workshop',
    accent: '#7cc4ff',
    en: { tag: '5 wood games in one', head: 'Chess, checkers *& more*', badge: '+5 games' },
    sv: { tag: '5 träspel i ett', head: 'Schack, dam *och mer*', badge: '+5 spel' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, null);
      await openHub(p);
      await p.waitForTimeout(600);
      return p;
    },
  },
  {
    id: 'journey',
    accent: '#3fe0b4',
    en: { tag: 'Journey', head: '100 levels, *300 stars*', badge: '★★★' },
    sv: { tag: 'Äventyr', head: '100 banor, *300 stjärnor*', badge: '★★★' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, null);
      await p.locator('.journey-btn').click();
      await p.waitForTimeout(900);
      return p;
    },
  },
  {
    id: 'modes',
    accent: '#ff8a65',
    en: { tag: 'Daily · Zen · Blitz', head: 'A mode for every *mood*' },
    sv: { tag: 'Dagens · Zen · Blixt', head: 'Ett läge för varje *humör*' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, null);
      await p.waitForTimeout(1600);
      return p;
    },
  },
  {
    id: 'combo',
    accent: '#f0b94a',
    en: { tag: 'Combos', head: 'Chain it, clear the *board*', badge: 'Board clear!' },
    sv: { tag: 'Kombos', head: 'Bygg kombos, töm *brädan*', badge: 'Tom bräda!' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, BOARD_CLEAR);
      await dragTo(p, await slot(p, 0), await toScreen(p, 4, -0.94, 4), true);
      await waitGame(p, 0.08);
      return p;
    },
  },
  {
    id: 'school',
    accent: '#c7a2ff',
    en: { tag: 'Chess school', head: 'Train like a *grandmaster*', badge: 'Daily training' },
    sv: { tag: 'Schackskola', head: 'Träna som en *stormästare*', badge: 'Daglig träning' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, null, { local: { grain_chess_view: 'top' } });
      await playWorkshop(p, 'school', 2);
      await p.waitForTimeout(1500);
      return p;
    },
  },
  {
    id: 'puzzles',
    accent: '#7cc4ff',
    en: { tag: 'Brain teasers', head: 'Slide, fit and *solve*' },
    sv: { tag: 'Klurigt', head: 'Skjut, pussla och *lös*' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, null);
      await playWorkshop(p, 'klotski', 1);
      await p.waitForTimeout(1500);
      return p;
    },
  },
  {
    id: 'woods',
    accent: '#f0b94a',
    en: { tag: 'Collect', head: 'Unlock eight *woods*' },
    sv: { tag: 'Samla', head: 'Lås upp åtta *träslag*' },
    run: async (lang, dev) => {
      const p = await gamePage(lang, dev, TRIPLE, { theme: 'walnut' });
      await p.evaluate(() => window.__grain.game.showAwards());
      await p.waitForTimeout(800);
      return p;
    },
  },
];

// ---------- composition ----------
const fontDisplay = readFileSync('public/fonts/fraunces-latin-800-normal.woff2').toString('base64');
const fontUi = readFileSync('public/fonts/dm-sans-latin-700-normal.woff2').toString('base64');
const iconPng = readFileSync('assets/icon-only.png').toString('base64');
const FONTS = `@font-face{font-family:F;src:url(data:font/woff2;base64,${fontDisplay})}
  @font-face{font-family:U;src:url(data:font/woff2;base64,${fontUi})}`;

/** 'Learn the *best move*' → html with the starred words in the accent gradient. */
const headHtml = (s) => s.replace(/\*(.+?)\*/g, '<em>$1</em>');

/** Sparkles: four-pointed stars and soft dots, placed by a fixed seed (same every run). */
function sparkles(W, H, accent, n, seedBase) {
  let x = seedBase * 9301 + 49297;
  const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  let out = '';
  for (let i = 0; i < n; i++) {
    const px = rnd() * W;
    const py = rnd() * H;
    const s = (0.008 + rnd() * 0.018) * W;
    const star = rnd() < 0.55;
    const col = rnd() < 0.5 ? accent : '#ffe7a8';
    const op = 0.35 + rnd() * 0.5;
    out += star
      ? `<svg style="position:absolute;left:${px}px;top:${py}px;width:${s}px;height:${s}px;opacity:${op}" viewBox="0 0 24 24"><path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill="${col}"/></svg>`
      : `<i style="position:absolute;left:${px}px;top:${py}px;width:${s * 0.5}px;height:${s * 0.5}px;border-radius:50%;background:${col};opacity:${op * 0.6};filter:blur(${s * 0.08}px)"></i>`;
  }
  return out;
}

/** One store screenshot: tag, headline, the game in a phone frame, glow, sparkles, sticker. */
async function compose(shot, scene, lang, dev, index, out) {
  const [W, H] = DEVICES[dev].size;
  const [gw, gh] = DEVICES[dev].game;
  const t = scene[lang];
  const a = scene.accent;
  // the device: as big as fits under the headline
  const maxW = W * 0.84;
  const maxH = H * 0.71;
  const dw = Math.min(maxW, (maxH * gw) / gh);
  const dh = (dw * gh) / gw;
  const bezel = Math.round(dw * 0.028);
  const radius = Math.round(dw * 0.085);
  const cap = Math.round(W * (dev === 'ipad13' ? 0.058 : 0.074));
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<style>${FONTS}
    *{box-sizing:border-box}
    body{margin:0;width:${W}px;height:${H}px;overflow:hidden;position:relative;
      background:radial-gradient(90% 55% at 50% 64%,${a}38,transparent 70%),
        radial-gradient(130% 70% at 50% 0%,#6a4224,#2a170b 62%,#160b04);
      display:flex;flex-direction:column;align-items:center;font-family:U}
    .top{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;margin-top:${Math.round(H * 0.045)}px;padding:0 ${Math.round(W * 0.06)}px}
    .tag{display:inline-flex;align-items:center;gap:${Math.round(cap * 0.2)}px;padding:${Math.round(cap * 0.16)}px ${Math.round(cap * 0.42)}px;border-radius:999px;
      background:${a}24;border:${Math.max(2, Math.round(W * 0.002))}px solid ${a}88;color:${a};font:700 ${Math.round(cap * 0.36)}px/1 U;letter-spacing:.12em;text-transform:uppercase}
    h1{margin:${Math.round(cap * 0.32)}px 0 0;font:800 ${cap}px/1.06 F;color:#fff6e6;text-align:center;letter-spacing:-.01em;
      text-shadow:0 ${Math.round(cap * 0.05)}px 0 rgba(40,18,6,.55),0 ${Math.round(cap * 0.2)}px ${Math.round(cap * 0.5)}px rgba(0,0,0,.35)}
    em{font-style:normal;background:linear-gradient(180deg,#fff3c8,${a});-webkit-background-clip:text;background-clip:text;color:transparent;
      text-shadow:none;filter:drop-shadow(0 ${Math.round(cap * 0.05)}px 0 rgba(40,18,6,.55))}
    .dev{position:relative;z-index:2;margin-top:${Math.round(H * 0.035)}px;width:${dw}px;height:${dh}px;border-radius:${radius}px;padding:${bezel}px;
      background:linear-gradient(145deg,#4a3020,#140a04 40%,#2a1a0e);
      box-shadow:0 0 0 ${Math.max(2, Math.round(dw * 0.004))}px #6b4a30 inset,0 ${Math.round(dw * 0.05)}px ${Math.round(dw * 0.12)}px rgba(0,0,0,.6),0 0 ${Math.round(dw * 0.18)}px ${a}55}
    .dev img{display:block;width:100%;height:100%;border-radius:${radius - bezel}px;object-fit:cover}
    .glow{position:absolute;z-index:1;left:50%;top:58%;width:${W * 1.1}px;height:${W * 0.9}px;transform:translate(-50%,-50%);
      background:radial-gradient(closest-side,${a}40,transparent);filter:blur(${Math.round(W * 0.02)}px)}
    .badge{position:absolute;z-index:3;right:${Math.round(-dw * 0.05)}px;top:${Math.round(-cap * 0.55)}px;transform:rotate(6deg);
      padding:${Math.round(cap * 0.2)}px ${Math.round(cap * 0.42)}px;border-radius:${Math.round(cap * 0.4)}px;
      background:linear-gradient(180deg,#ffe7a8,${a});color:#2a1406;font:800 ${Math.round(cap * 0.4)}px/1 U;
      box-shadow:0 ${Math.round(cap * 0.08)}px 0 rgba(90,50,10,.6),0 ${Math.round(cap * 0.25)}px ${Math.round(cap * 0.6)}px rgba(0,0,0,.45)}
    .fx{position:absolute;inset:0;z-index:1;pointer-events:none}
  </style>
  <div class="glow"></div>
  <div class="fx">${sparkles(W, H, a, 26, index + 1)}</div>
  <div class="top"><span class="tag">${t.tag}</span><h1>${headHtml(t.head)}</h1></div>
  <div class="dev"><img src="data:image/png;base64,${shot.toString('base64')}">${t.badge ? `<div class="badge">${t.badge}</div>` : ''}</div>`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot();
  await page.close();
  writeFileSync(out, pngToRgb(png));
}

/**
 * Header / feature banner (App Store featuring and in-app event cards 1920×1080, Google Play
 * feature graphic 1024×500): icon, name, tagline, mode chips, and three tilted phones.
 */
async function header(shots, lang, W, H, out) {
  const t = {
    en: {
      tag: 'Wood block puzzle',
      line: 'Satisfying clears, a chess coach and 5 wood games',
      chips: ['Classic', 'Journey', 'Daily', 'Zen', 'Blitz', 'Chess'],
    },
    sv: {
      tag: 'Träklosspussel',
      line: 'Härliga rensningar, schackcoach och 5 träspel',
      chips: ['Klassisk', 'Äventyr', 'Dagens', 'Zen', 'Blixt', 'Schack'],
    },
  }[lang];
  const u = H / 1080;
  const ph = H * 0.8;
  const pw = (ph * 390) / 760;
  const phone = (img, x, y, rot, z, a) =>
    `<div style="position:absolute;left:${x}px;top:${y}px;width:${pw}px;height:${ph}px;transform:rotate(${rot}deg);z-index:${z};
      border-radius:${pw * 0.11}px;padding:${pw * 0.03}px;background:linear-gradient(145deg,#4a3020,#140a04 40%,#2a1a0e);
      box-shadow:0 0 0 ${3 * u}px #6b4a30 inset,0 ${40 * u}px ${90 * u}px rgba(0,0,0,.6),0 0 ${120 * u}px ${a}55">
      <img style="display:block;width:100%;height:100%;object-fit:cover;border-radius:${pw * 0.085}px" src="data:image/png;base64,${img.toString('base64')}"></div>`;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<style>${FONTS}
    body{margin:0;width:${W}px;height:${H}px;overflow:hidden;position:relative;font-family:U;
      background:radial-gradient(60% 90% at 78% 55%,#f0b94a40,transparent 70%),radial-gradient(120% 120% at 20% 0%,#6a4224,#2a170b 60%,#160b04)}
    .copy{position:absolute;left:${W * 0.06}px;top:50%;transform:translateY(-50%);width:${W * 0.44}px;z-index:4}
    .brand{display:flex;align-items:center;gap:${28 * u}px}
    .brand img{width:${150 * u}px;height:${150 * u}px;border-radius:${34 * u}px;box-shadow:0 ${16 * u}px ${40 * u}px rgba(0,0,0,.5)}
    .name{font:800 ${140 * u}px/1 F;color:#fff6e6;text-shadow:0 ${6 * u}px 0 rgba(40,18,6,.55)}
    .tag{margin-top:${10 * u}px;color:#f0b94a;font:700 ${30 * u}px/1 U;letter-spacing:.16em;text-transform:uppercase}
    .line{margin:${40 * u}px 0 0;font:800 ${58 * u}px/1.12 F;color:#fff6e6}
    .chips{display:flex;flex-wrap:wrap;gap:${12 * u}px;margin-top:${36 * u}px}
    .chips span{padding:${12 * u}px ${22 * u}px;border-radius:999px;font:700 ${26 * u}px/1 U;color:#fff6e6;background:rgba(255,246,230,.1);border:${2 * u}px solid rgba(255,246,230,.18)}
    .chips span:nth-child(1){background:#f0b94a33;border-color:#f0b94a99;color:#ffd77a}
    .chips span:nth-child(6){background:#3fe0b433;border-color:#3fe0b499;color:#8ff0d2}
    .fx{position:absolute;inset:0;z-index:1}
  </style>
  <div class="fx">${sparkles(W, H, '#f0b94a', 34, 7)}</div>
  <div class="copy">
    <div class="brand"><img src="data:image/png;base64,${iconPng}"><div><div class="name">Grain</div><div class="tag">${t.tag}</div></div></div>
    <div class="line">${t.line}</div>
    <div class="chips">${t.chips.map((c) => `<span>${c}</span>`).join('')}</div>
  </div>
  ${phone(shots[2], W * 0.505, H * 0.13, -7, 2, '#7cc4ff')}
  ${phone(shots[1], W * 0.805, H * 0.13, 7, 2, '#3fe0b4')}
  ${phone(shots[0], W * 0.655, H * 0.09, 0, 3, '#f0b94a')}`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot();
  await page.close();
  writeFileSync(out, pngToRgb(png));
}

/**
 * How the listing looks in App Store search (for review, not upload): icon, name, subtitle,
 * Get, and the first three screenshots side by side.
 */
async function searchPreview(files, lang, out) {
  const W = 1290;
  const H = 1400;
  const t = {
    en: { name: 'Grain: Wood Block Puzzle', sub: 'Relaxing 3D carved wood game', get: 'Get' },
    sv: { name: 'Grain: Wood Block Puzzle', sub: 'Avkopplande träspel i 3D', get: 'Hämta' },
  }[lang];
  const imgs = files.map((f) => readFileSync(f).toString('base64'));
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<style>${FONTS}
    body{margin:0;width:${W}px;height:${H}px;background:#000;font-family:-apple-system,U;color:#fff;padding:60px 48px;box-sizing:border-box}
    .row{display:flex;align-items:center;gap:30px}
    .row img{width:190px;height:190px;border-radius:42px}
    .t{flex:1}.n{font:700 44px/1.2 U}.s{font:500 34px/1.3 U;color:#8e8e93;margin-top:6px}
    .stars{color:#8e8e93;font:500 30px U;margin-top:8px}
    .get{padding:16px 46px;border-radius:999px;background:#2c2c2e;color:#0a84ff;font:700 36px U}
    .shots{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:44px}
    .shots img{width:100%;border-radius:30px;display:block}
  </style>
  <div class="row"><img src="data:image/png;base64,${iconPng}"><div class="t"><div class="n">${t.name}</div><div class="s">${t.sub}</div><div class="stars">★★★★★</div></div><div class="get">${t.get}</div></div>
  <div class="shots">${imgs.map((i) => `<img src="data:image/png;base64,${i}">`).join('')}</div>`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot();
  await page.close();
  writeFileSync(out, png);
}

// ---------- run ----------
// raw game captures are shared by devices with the same game viewport (all three iPhone sizes)
const rawKey = (dev) => `${DEVICES[dev].game.join('x')}@${DEVICES[dev].scale}`;
for (const lang of (process.env.LANGS ?? 'en,sv').split(',')) {
  mkdirSync(`store/${lang}`, { recursive: true });
  const raw = new Map();
  for (const dev of (process.env.DEVICES ?? Object.keys(DEVICES).join(',')).split(',')) {
    for (let i = 0; i < SCENES.length; i++) {
      if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(i + 1))) continue;
      const key = `${rawKey(dev)}#${i}`;
      if (!raw.has(key)) {
        const page = await SCENES[i].run(lang, dev);
        raw.set(key, await page.screenshot());
        await page.close();
      }
      const out = `store/${lang}/${dev}-${i + 1}.png`;
      await compose(raw.get(key), SCENES[i], lang, dev, i, out);
      console.log('wrote', out);
    }
  }
  // header banners and the search preview from the iPhone set
  const phoneShots = [0, 1, 2].map((i) => raw.get(`${rawKey('iphone69')}#${i}`));
  if (phoneShots.every(Boolean)) {
    await header(phoneShots, lang, 1920, 1080, `store/${lang}/header-1920x1080.png`);
    await header(phoneShots, lang, 1024, 500, `store/${lang}/play-feature-1024x500.png`);
    await searchPreview(
      [1, 2, 3].map((n) => `store/${lang}/iphone69-${n}.png`),
      lang,
      `store/${lang}/search-preview.png`,
    );
    console.log('wrote', `store/${lang}/header-1920x1080.png, play-feature-1024x500.png, search-preview.png`);
  }
}
await browser.close();
