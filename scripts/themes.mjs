// Theme + awards screenshots (needs `npm run dev` running).
// Usage: node scripts/themes.mjs [url] [outDir]
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const THEMES = ['maple', 'walnut', 'cherry', 'birch', 'driftwood', 'ebony', 'oak', 'mahogany'];
const ALL = Object.fromEntries(
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
    'quests-3',
    'quests-7',
  ].map((id) => [id, 1]),
);
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
const save = {
  version: 2,
  score: 2480,
  streak: 0,
  misses: 0,
  sinceSmall: 0,
  rng: 7,
  groups: [
    grp(
      [
        [6, 1],
        [6, 2],
        [6, 3],
        [6, 4],
      ],
      1,
    ),
    grp(
      [
        [7, 1],
        [7, 2],
        [8, 1],
      ],
      2,
    ),
    grp(
      [
        [2, 2],
        [2, 3],
        [3, 3],
      ],
      3,
    ),
    grp(
      [
        [1, 6],
        [1, 7],
      ],
      4,
    ),
    grp(
      [
        [4, 6],
        [5, 6],
        [5, 7],
        [5, 8],
      ],
      5,
    ),
    grp(
      [
        [8, 5],
        [8, 6],
        [8, 7],
        [8, 8],
      ],
      6,
    ),
  ],
  tray: [
    { shapeIndex: 13, seed: seed(7) },
    { shapeIndex: 22, seed: seed(8) },
    { shapeIndex: 9, seed: seed(9) },
  ],
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let errors = 0;
const page = await browser.newPage({ locale: 'en-US', viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => (errors++, console.log('pageerror:', e.message)));
page.on('console', (m) => m.type() === 'error' && (errors++, console.log(m.text())));
await page.addInitScript(
  ([s, a]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('grain_tutorial_v1', '1');
    localStorage.setItem('grain_best_v1', '12840');
    localStorage.setItem('grain_save_v1', s);
    localStorage.setItem('grain_achievements_v1', a);
    localStorage.setItem(
      'grain_stats_v1',
      JSON.stringify({
        gamesPlayed: 23,
        totalScore: 61200,
        bestScore: 12840,
        linesCleared: 612,
        bestCombo: 7,
        boardClears: 2,
        biggestClear: 4,
        piecesPlaced: 2210,
      }),
    );
    localStorage.setItem('grain_settings_v1', JSON.stringify({ sound: false, music: false }));
  },
  [JSON.stringify(save), JSON.stringify(ALL)],
);
await page.goto(url);
await page.waitForFunction(() => window.__grain);
await page.getByRole('button', { name: 'Continue' }).click();
for (const t of THEMES) {
  await page.evaluate((id) => window.__grain.store.getState().setSetting('theme', id), t);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/theme-${t}.png` });
}
await page.evaluate(() => window.__grain.store.getState().setSetting('theme', 'maple'));
await page.evaluate(() => window.__grain.store.getState().pause());
await page.locator('.pause').getByRole('button', { name: 'Awards' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/awards.png` });
await page.locator('.awards .card').screenshot({ path: `${out}/awards-card.png` });
// banner
await page.getByRole('button', { name: 'Done' }).click();
await page.getByRole('button', { name: 'Resume' }).click();
await page.evaluate(() => {
  const g = window.__grain.game;
  g.banner.node.style.top = `${g.hud.bottom + 8}px`;
  g.banner.push(['board-clear']);
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/banner.png` });
await browser.close();
console.log(errors ? `${errors} console error(s)` : 'no console errors');
process.exit(errors ? 1 : 0);
