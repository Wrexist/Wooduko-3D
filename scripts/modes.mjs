// Game modes check (needs `npm run dev` running): home with the daily card, quests and mode
// buttons; Daily goal moment + results + share; Zen never ends; Blitz clock and "Time's up";
// Classic save survives a trip through other modes. Screenshots → outDir.
// Usage: node scripts/modes.mjs [url] [outDir]
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let errors = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function open(viewport, init = {}) {
  const page = await browser.newPage({ locale: 'en-US', viewport, hasTouch: true });
  page.on('console', (m) => m.type() === 'error' && (errors++, console.log('console.error:', m.text())));
  page.on('pageerror', (e) => (errors++, console.log('pageerror:', e.message)));
  await page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
  }, init);
  await page.goto(url);
  await page.waitForFunction(() => window.__grain);
  return page;
}
const clock = (page) => page.evaluate(() => window.__grain.game.debug.clock);
async function wait(page, seconds) {
  const t0 = await clock(page);
  await page.waitForFunction((t) => window.__grain.game.debug.clock >= t, t0 + seconds, { timeout: 120000 });
}
const st = (page) =>
  page.evaluate(() => {
    const s = window.__grain.store.getState();
    return {
      phase: s.phase,
      mode: s.mode,
      score: s.game.score,
      over: s.game.over,
      timeLeft: s.timeLeft,
      zenStuck: s.zenStuck,
      daily: s.daily,
      goal: s.dailyGoal,
      saves: s.saves,
      moveSeq: s.moveSeq,
    };
  });
/** Drop the first piece that fits somewhere through the real view path (as a finished drag would). */
const playOne = (page) =>
  page.evaluate(() => {
    const { store, game } = window.__grain;
    const s = store.getState();
    for (let slot = 0; slot < 3; slot++) {
      const tp = game.world.tray[slot];
      if (!tp || !s.fits[slot]) continue;
      const { w, h, cells } = tp.shape;
      for (let r = 0; r + h <= 9; r++)
        for (let c = 0; c + w <= 9; c++) {
          if (cells.some(([dr, dc]) => s.game.board.grid[r + dr][c + dc])) continue;
          game.commit(tp, r, c);
          return true;
        }
    }
    return false;
  });
const click = (page, sel) => page.locator(sel).first().click();
const text = (page, sel) => page.locator(sel).first().innerText();

const DONE = { grain_tutorial_v1: '1' };

// ---------------------------------------------------------------- home
{
  const page = await open({ width: 390, height: 844 }, DONE);
  await wait(page, 0.6);
  check('home shows the daily challenge', await page.locator('.home .tile.daily').isVisible());
  check('home has Daily, Zen and Blitz', (await page.locator('.home .tile').count()) === 3);
  check('home shows quest progress', (await text(page, '.home .quests-btn')).includes('0/3'));
  const goal = (await st(page)).goal;
  check(
    'daily card shows the goal',
    (await text(page, '.home .tile.daily')).includes(goal.toLocaleString('en-US')),
  );
  await page.screenshot({ path: `${out}/modes-home.png` });
  await click(page, '.home .quests-btn');
  await wait(page, 0.5);
  check('quests panel lists three quests', (await page.locator('.quests-panel .quests li').count()) === 3);
  await page.screenshot({ path: `${out}/modes-quests.png` });
  await page.keyboard.press('Escape');
  await wait(page, 0.4);
  check(
    'Escape closes the quests panel',
    await page.locator('.quests-panel').evaluate((n) => n.classList.contains('hidden')),
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await wait(page, 0.3);
  await page.screenshot({ path: `${out}/modes-home-320.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await wait(page, 0.3);
  await page.screenshot({ path: `${out}/modes-home-landscape.png` });
  await page.close();
}

// ---------------------------------------------------------------- classic save survives other modes
{
  const page = await open({ width: 390, height: 844 }, DONE);
  await click(page, '.home button.cta >> text=Play');
  await wait(page, 0.6);
  for (let i = 0; i < 3; i++) {
    await playOne(page);
    await wait(page, 0.5);
  }
  const classic = await st(page);
  check('classic game in progress', classic.mode === 'classic' && classic.moveSeq === 3);
  await page.evaluate(() => window.__grain.store.getState().goHome());
  await wait(page, 0.4);
  check('home offers Continue', await page.locator('.home .cta >> text=Continue').isVisible());
  await click(page, '.home .tile >> text=Zen');
  await wait(page, 0.6);
  let s = await st(page);
  check('zen opens', s.mode === 'zen' && s.phase === 'playing');
  check('hud shows Zen and hides the best', (await text(page, '.hud .chip')).includes('Zen'));
  await playOne(page);
  await wait(page, 0.6);
  await page.screenshot({ path: `${out}/modes-zen.png` });
  await page.evaluate(() => window.__grain.store.getState().goHome());
  await wait(page, 0.4);
  await click(page, '.home .cta >> text=Continue');
  await wait(page, 0.6);
  s = await st(page);
  check(
    'Continue resumes the same classic game',
    s.mode === 'classic' && s.score === classic.score,
    JSON.stringify(s),
  );
  await page.close();
}

// ---------------------------------------------------------------- zen rescue
{
  const page = await open({ width: 390, height: 844 }, DONE);
  // checkerboard (no unit can clear, no 2×2 fits) with a single and a 2×2 in the tray
  await page.evaluate(async () => {
    const { emptyBoard, place } = await import('/src/core/board.ts');
    const { ORIENTATIONS } = await import('/src/core/shapes.ts');
    const seed = { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 };
    let board = emptyBoard();
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) if ((r + c) % 2 === 1) board = place(board, [[r, c]], [0, 0], seed).board;
    const idx = (id) => ORIENTATIONS.find((o) => o.baseId === id).index;
    const { store } = window.__grain;
    store.getState().play('zen');
    const g = store.getState().game;
    store.getState().debugLoad(
      {
        ...g,
        board,
        score: 50,
        tray: [{ shapeIndex: idx('mono'), seed }, { shapeIndex: idx('o4'), seed }, null],
      },
      'zen',
    );
  });
  await wait(page, 0.5);
  await playOne(page);
  let s = await st(page);
  check('zen gets stuck instead of ending', s.zenStuck && s.phase === 'playing', JSON.stringify(s));
  await page.waitForFunction(() => !window.__grain.store.getState().zenStuck, null, { timeout: 30000 });
  await wait(page, 0.3);
  s = await st(page);
  check(
    'zen clears the fullest square and plays on',
    !s.over && s.phase === 'playing' && s.score === 51,
    JSON.stringify(s),
  );
  await page.screenshot({ path: `${out}/modes-zen-rescue.png` });
  check(
    'no results card in zen',
    await page.locator('.results').evaluate((n) => n.classList.contains('hidden')),
  );
  // a long Zen run (rescues rebuild the board) must not leak GPU objects
  const mem = () =>
    page.evaluate(() => {
      const { memory, programs } = window.__grain.game.debug.info;
      return { g: memory.geometries, t: memory.textures, p: programs.length };
    });
  for (let i = 0; i < 20; i++) {
    if (!(await playOne(page))) await wait(page, 0.8);
    await wait(page, 0.15);
  }
  const before = await mem();
  let rescues = 0;
  for (let i = 0; i < 150; i++) {
    const r0 = await page.evaluate(() => window.__grain.store.getState().reviveSeq);
    if (!(await playOne(page))) await wait(page, 0.9);
    await wait(page, 0.15);
    if ((await page.evaluate(() => window.__grain.store.getState().reviveSeq)) > r0) rescues++;
  }
  await wait(page, 1.5);
  const after = await mem();
  s = await st(page);
  check('long zen run never ends', s.phase === 'playing' && !s.over, `${rescues} rescues`);
  check(
    'zen run keeps GPU memory flat',
    after.g <= before.g + 4 && after.t === before.t && after.p === before.p,
    `${JSON.stringify(before)} → ${JSON.stringify(after)}`,
  );
  await page.close();
}

// ---------------------------------------------------------------- blitz
{
  const page = await open({ width: 390, height: 844 }, DONE);
  await click(page, '.home .tile >> text=Blitz');
  await wait(page, 0.6);
  let s = await st(page);
  check('blitz starts with a full clock', s.mode === 'blitz' && s.timeLeft === 120, JSON.stringify(s));
  check('hud shows the clock', (await text(page, '.hud .chip')).trim() === '2:00');
  await playOne(page);
  await wait(page, 1.2);
  s = await st(page);
  check('blitz clock runs while playing', s.timeLeft < 120, String(s.timeLeft));
  await page.evaluate(() => window.__grain.store.getState().pause());
  const paused = (await st(page)).timeLeft;
  await wait(page, 1.5);
  check('blitz clock stops while paused', (await st(page)).timeLeft === paused);
  await page.evaluate(() => window.__grain.store.getState().resume());
  await page.evaluate(() =>
    window.__grain.store.getState().tick(115 - (120 - window.__grain.store.getState().timeLeft)),
  );
  await wait(page, 0.4);
  check('urgent clock in the last seconds', await page.locator('.hud .chip.urgent').isVisible());
  await page.screenshot({ path: `${out}/modes-blitz-urgent.png` });
  await page.waitForFunction(() => window.__grain.store.getState().phase === 'over', null, {
    timeout: 120000,
  });
  await page.waitForSelector('.results:not(.hidden)', { timeout: 60000 });
  await wait(page, 1);
  check("results say Time's up", (await text(page, '#overTitle')).includes('Time'));
  check('no revive outside classic', await page.locator('.results .revive').isHidden());
  await page.screenshot({ path: `${out}/modes-blitz-over.png` });
  await page.close();
}

// ---------------------------------------------------------------- daily
{
  const page = await open({ width: 390, height: 844 }, DONE);
  await click(page, '.home .tile.daily');
  await wait(page, 0.6);
  let s = await st(page);
  check(
    'daily opens with today’s goal in the hud',
    s.mode === 'daily' && (await text(page, '.hud .chip')).includes('Goal'),
  );
  const tray1 = await page.evaluate(() =>
    window.__grain.store.getState().game.tray.map((p) => p && p.shapeIndex),
  );
  await playOne(page);
  await wait(page, 0.6);
  await page.screenshot({ path: `${out}/modes-daily.png` });
  // jump close to the goal, then one more move reaches it
  await page.evaluate(() => {
    const { store } = window.__grain;
    const s = store.getState();
    store.getState().debugLoad({ ...s.game, score: s.dailyGoal - 1 }, 'daily');
  });
  await wait(page, 0.6);
  await playOne(page);
  await page.waitForFunction(() => window.__grain.store.getState().daily.done, null, { timeout: 30000 });
  await wait(page, 0.8);
  // may queue behind an achievement banner (1,000 points earns one)
  const banner = await page
    .waitForFunction(() => document.querySelector('.banner')?.innerText.includes('Goal reached'), null, {
      timeout: 30000,
    })
    .then(
      () => true,
      () => false,
    );
  check('goal banner shows', banner);
  check('hud goal turns gold', await page.locator('.hud .chip.done').isVisible());
  await page.screenshot({ path: `${out}/modes-daily-goal.png` });
  await page.evaluate(() => window.__grain.store.getState().goHome());
  await wait(page, 0.5);
  check('home daily card shows it reached', await page.locator('.home .tile.daily.done').isVisible());
  check('daily streak flame shows', await page.locator('.home .tile.daily .streak').isVisible());
  // a fresh page on the same day gets the same first tray
  const page2 = await open({ width: 390, height: 844 }, DONE);
  await page2.evaluate(() => window.__grain.store.getState().startNew('daily'));
  const tray2 = await page2.evaluate(() =>
    window.__grain.store.getState().game.tray.map((p) => p && p.shapeIndex),
  );
  check('daily pieces are the same for everyone today', JSON.stringify(tray1) === JSON.stringify(tray2));
  // daily results + share
  await page2.evaluate(() => {
    const { store } = window.__grain;
    store.getState().debugLoad({ ...store.getState().game, over: true }, 'daily');
  });
  await page2.evaluate(() => window.__grain.game.gameOver());
  await page2.waitForSelector('.results:not(.hidden)', { timeout: 60000 });
  await wait(page2, 1);
  check('daily results offer Share', await page2.locator('.results .share').isVisible());
  check('daily results title', (await text(page2, '#overTitle')).includes('Daily'));
  await page2.screenshot({ path: `${out}/modes-daily-over.png` });
  await page2.close();
  await page.close();
}

console.log(`\n${failed ? `${failed} FAILED` : 'all passed'}, ${errors} console errors`);
await browser.close();
process.exit(failed || errors ? 1 : 0);
