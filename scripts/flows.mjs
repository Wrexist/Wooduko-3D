// End-to-end flow check (needs `npm run dev` running).
// Usage: node scripts/flows.mjs [url] [outDir]
// Plays the tutorial, opens every menu, ends a game, and exercises touch / rotate / multi-touch.
// Prints PASS/FAIL per check and any console errors; screenshots go to outDir.
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const BASE_Y = -0.94;
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
const state = (page) =>
  page.evaluate(() => {
    const s = window.__grain.store.getState();
    return {
      phase: s.phase,
      score: s.game.score,
      tutorial: s.tutorial,
      tutorialDone: s.tutorialDone,
      moveSeq: s.moveSeq,
      over: s.game.over,
      best: s.best,
      tray: s.game.tray.map((p) => p && p.shapeIndex),
    };
  });
const clock = (page) => page.evaluate(() => window.__grain.game.debug.clock);
async function wait(page, seconds) {
  const t0 = await clock(page);
  await page.waitForFunction((t) => window.__grain.game.debug.clock >= t, t0 + seconds, { timeout: 120000 });
}
const slotScreen = (page, slot) =>
  page.evaluate((i) => {
    const w = window.__grain.game.world;
    const p = w.slotPos(i, w.camBase.clone());
    return w.toScreen(p.x, 0, p.z, innerWidth, innerHeight);
  }, slot);
const worldScreen = (page, x, z) =>
  page.evaluate(
    ([x, z, y]) => window.__grain.game.world.toScreen(x, y, z, innerWidth, innerHeight),
    [x, z, BASE_Y],
  );

/** Synthetic pointer drag (mouse or touch). Returns before release if `hold`. */
async function drag(page, from, to, { type = 'mouse', id = 1, hold = false, steps = 8 } = {}) {
  const fire = (t, p) =>
    page.evaluate(
      ([t, x, y, type, id]) => {
        const c = document.getElementById('c');
        c.dispatchEvent(
          new PointerEvent(t, {
            clientX: x,
            clientY: y,
            pointerType: type,
            pointerId: id,
            isPrimary: id === 1,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [t, p.x, p.y, type, id],
    );
  await fire('pointerdown', from);
  for (let i = 1; i <= steps; i++) {
    await fire('pointermove', {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
    await wait(page, 0.02);
  }
  if (!hold) await fire('pointerup', to);
  return fire;
}

// ---------------------------------------------------------------- tutorial (first run)
{
  const page = await open({ width: 390, height: 844 });
  let s = await state(page);
  check('first run opens the tutorial', s.tutorial && s.phase === 'playing');
  await wait(page, 0.8);
  await page.screenshot({ path: `${out}/flow-tutorial-1.png` });

  // a wrong spot is rejected in the tutorial
  await drag(page, await slotScreen(page, 1), await worldScreen(page, -3.5, -3.5));
  await wait(page, 0.6);
  s = await state(page);
  check('tutorial rejects a drop outside the target', s.moveSeq === 0);

  const targets = [
    [-0.5, 0],
    [2, -1],
    [-0.5, -0.5],
  ];
  for (let i = 0; i < targets.length; i++) {
    const [x, z] = targets[i];
    // the tutorial board loads after the previous step's delay
    await page.waitForFunction(
      () => window.__grain.store.getState().tutorial && window.__grain.game.world.tray[1],
    );
    await wait(page, 0.3);
    if (i === 1) await page.screenshot({ path: `${out}/flow-tutorial-2.png` });
    const seq = (await state(page)).moveSeq;
    await drag(page, await slotScreen(page, 1), await worldScreen(page, x, z));
    await page.waitForFunction((q) => window.__grain.store.getState().moveSeq > q, seq, { timeout: 60000 });
    if (i === 2) {
      await wait(page, 0.3);
      await page.screenshot({ path: `${out}/flow-tutorial-3-clear.png` });
    }
    await wait(page, 1.4);
  }
  s = await state(page);
  check(
    'tutorial completes into a real game',
    s.tutorialDone && !s.tutorial && s.phase === 'playing' && s.score === 0,
    JSON.stringify(s),
  );
  check(
    'tutorial completion is remembered',
    (await page.evaluate(() => localStorage.getItem('grain_tutorial_v1'))) === '1',
  );
  await page.close();
}

// ---------------------------------------------------------------- skip tutorial
{
  const page = await open({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await wait(page, 0.5);
  const s = await state(page);
  check('Skip starts a real game', s.tutorialDone && !s.tutorial && s.phase === 'playing');
  await page.close();
}

// ---------------------------------------------------------------- menus
for (const [name, viewport] of Object.entries({
  portrait: { width: 390, height: 844 },
  landscape: { width: 1280, height: 800 },
})) {
  const page = await open(viewport, { grain_tutorial_v1: '1', grain_best_v1: '1234' });
  await wait(page, 0.6);
  await page.screenshot({ path: `${out}/flow-${name}-home.png` });
  check(
    `${name}: home shows Play + best`,
    (await page.getByRole('button', { name: 'Play' }).isVisible()) &&
      (await page.locator('.home .best').innerText()).includes('1,234'),
  );
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(page, 1.0);
  // place one piece to get a score
  const tray = await state(page);
  let placed = false;
  for (let slot = 0; slot < 3 && !placed; slot++) {
    if (tray.tray[slot] === null) continue;
    const seq = (await state(page)).moveSeq;
    await drag(page, await slotScreen(page, slot), await worldScreen(page, 0, 0));
    await wait(page, 0.6);
    placed = (await state(page)).moveSeq > seq;
  }
  check(`${name}: a piece can be placed`, placed);
  await page.getByRole('button', { name: 'Pause' }).click();
  await wait(page, 0.4);
  await page.screenshot({ path: `${out}/flow-${name}-pause.png` });
  check(`${name}: pause menu`, (await state(page)).phase === 'paused');
  await page.locator('.pause').getByRole('button', { name: 'Settings' }).click();
  await wait(page, 0.4);
  await page.screenshot({ path: `${out}/flow-${name}-settings.png` });
  await page.getByRole('switch', { name: 'Reduce motion' }).click();
  const rm = await page.evaluate(() => window.__grain.store.getState().settings.reduceMotion);
  check(
    `${name}: settings toggle persists`,
    rm && (await page.evaluate(() => JSON.parse(localStorage.getItem('grain_settings_v1')).reduceMotion)),
  );
  await page.getByRole('switch', { name: 'Reduce motion' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.locator('.pause').getByRole('button', { name: 'Restart' }).click();
  await wait(page, 0.4);
  await page.screenshot({ path: `${out}/flow-${name}-confirm.png` });
  check(
    `${name}: restart asks to confirm`,
    await page.getByRole('heading', { name: 'Start over?' }).isVisible(),
  );
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  check(
    `${name}: cancel keeps the game`,
    (await state(page)).score > 0 && (await state(page)).phase === 'playing',
  );
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.pause').getByRole('button', { name: 'Home' }).click();
  await wait(page, 0.4);
  check(`${name}: home offers Continue`, await page.getByRole('button', { name: 'Continue' }).isVisible());
  await page.reload();
  await page.waitForFunction(() => window.__grain);
  check(
    `${name}: save survives reload`,
    (await state(page)).score > 0 && (await page.getByRole('button', { name: 'Continue' }).isVisible()),
  );
  await page.close();
}

// ---------------------------------------------------------------- game over
{
  const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
  const groups = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if ((r + c) % 2 === 1) groups.push({ cells: [[r, c]], center: [c + 0.5, r + 0.5], seed });
  const save = {
    version: 1,
    score: 990,
    streak: 0,
    rng: 9,
    groups,
    tray: [{ shapeIndex: 0, seed }, { shapeIndex: 13, seed }, null],
  };
  const page = await open(
    { width: 390, height: 844 },
    { grain_tutorial_v1: '1', grain_best_v1: '500', grain_save_v1: JSON.stringify(save) },
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await wait(page, 0.6);
  await drag(page, await slotScreen(page, 0), await worldScreen(page, -4, -4));
  await page.waitForFunction(() => window.__grain.store.getState().phase === 'over', null, {
    timeout: 60000,
  });
  await wait(page, 2.2);
  await page.screenshot({ path: `${out}/flow-gameover.png` });
  const s = await state(page);
  check('game over shows results', await page.getByRole('heading', { name: 'No room left' }).isVisible());
  check(
    'new best on results',
    (await page.locator('.bestline').innerText()).includes('New best') && s.best === 991,
  );
  check(
    'save deleted on game over',
    (await page.evaluate(() => localStorage.getItem('grain_save_v1'))) === null,
  );
  await page.getByRole('button', { name: 'Play again' }).click();
  await wait(page, 0.5);
  check(
    'play again starts fresh',
    (await state(page)).score === 0 && (await state(page)).phase === 'playing',
  );
  await page.close();
}

// ---------------------------------------------------------------- touch, rotate mid-drag, second finger
{
  const page = await open({ width: 390, height: 844 }, { grain_tutorial_v1: '1' });
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(page, 1.0);
  const from = await slotScreen(page, 0);
  const to = await worldScreen(page, 0, 0);
  const fire = await drag(page, from, to, { type: 'touch', id: 7, hold: true });
  await wait(page, 0.4);
  const d = await page.evaluate(() => {
    const dd = window.__grain.game.drag.drag;
    return dd && { offZ: dd.offZ, z: dd.tp.pivot.position.z };
  });
  check('touch drag floats the piece above the finger', d && d.offZ < 0, JSON.stringify(d));
  // second finger: ignored
  await page.evaluate(() =>
    document.getElementById('c').dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 50,
        clientY: 700,
        pointerType: 'touch',
        pointerId: 8,
        bubbles: true,
      }),
    ),
  );
  const still = await page.evaluate(() => window.__grain.game.drag.drag?.pointerId);
  check('second finger is ignored', still === 7);
  // rotate mid-drag
  await page.setViewportSize({ width: 844, height: 390 });
  await wait(page, 0.4);
  await fire('pointermove', await worldScreen(page, 1, 1));
  await wait(page, 0.4);
  await page.screenshot({ path: `${out}/flow-rotate-middrag.png` });
  await fire('pointercancel', { x: 0, y: 0 });
  await wait(page, 0.8);
  const back = await page.evaluate(() => {
    const w = window.__grain.game.world;
    const t = w.tray[0];
    const p = w.slotPos(0, t.pivot.position.clone());
    return { dx: Math.abs(t.pivot.position.x - p.x), dz: Math.abs(t.pivot.position.z - p.z), anim: t.anim };
  });
  check(
    'cancelled piece returns to its (new) slot',
    back.dx < 0.01 && back.dz < 0.01 && !back.anim,
    JSON.stringify(back),
  );
  // background mid-drag
  await drag(page, await slotScreen(page, 1), await worldScreen(page, 0, 0), { hold: true, id: 9 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(page, 0.1);
  const s = await state(page);
  check(
    'backgrounding mid-drag pauses and drops nothing',
    s.phase === 'paused' &&
      s.moveSeq === 0 &&
      !(await page.evaluate(() => window.__grain.game.drag.dragging)),
  );
  await page.close();
}

// ---------------------------------------------------------------- combo grace: pill dims after a forgiven miss
{
  const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
  const save = {
    version: 2,
    score: 300,
    streak: 3,
    misses: 0,
    sinceSmall: 0,
    rng: 5,
    groups: [],
    tray: [
      { shapeIndex: 0, seed },
      { shapeIndex: 0, seed },
      { shapeIndex: 0, seed },
    ],
  };
  const page = await open(
    { width: 390, height: 844 },
    { grain_tutorial_v1: '1', grain_save_v1: JSON.stringify(save) },
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await wait(page, 0.6);
  const pill = () => page.evaluate(() => document.querySelector('.combo').className);
  check(
    'combo pill shows a live streak',
    (await pill()).includes('show') && !(await pill()).includes('risk'),
  );
  await drag(page, await slotScreen(page, 0), await worldScreen(page, 0, 0));
  await wait(page, 0.6);
  const s1 = await page.evaluate(() => window.__grain.store.getState().game);
  check(
    'a miss is forgiven once: streak kept, pill at risk',
    s1.streak === 3 && s1.misses === 1 && (await pill()).includes('risk'),
  );
  await page.screenshot({ path: `${out}/flow-combo-risk.png` });
  await drag(page, await slotScreen(page, 1), await worldScreen(page, 2, 2));
  await wait(page, 0.6);
  const s2 = await page.evaluate(() => window.__grain.store.getState().game);
  check(
    'the second miss ends the streak and hides the pill',
    s2.streak === 0 && !(await pill()).includes('show'),
  );
  await page.close();
}

// ---------------------------------------------------------------- native service triggers (fake services)
{
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => (errors++, console.log('pageerror:', e.message)));
  const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
  const groups = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if ((r + c) % 2 === 1) groups.push({ cells: [[r, c]], center: [c + 0.5, r + 0.5], seed });
  const save = {
    version: 2,
    score: 990,
    streak: 0,
    misses: 0,
    sinceSmall: 0,
    rng: 9,
    groups,
    tray: [{ shapeIndex: 0, seed }, { shapeIndex: 13, seed }, null],
  };
  await page.addInitScript((sv) => {
    window.__calls = [];
    const log =
      (name) =>
      async (...a) => {
        window.__calls.push([name, ...a.map((x) => (x instanceof Date ? x.toISOString() : x))]);
        return true;
      };
    window.__fakeServices = {
      gameCenter: {
        available: () => true,
        signIn: log('signIn'),
        submitBest: log('submitBest'),
        unlock: log('unlock'),
        showLeaderboard: log('leaderboard'),
      },
      review: { available: () => true, request: log('review') },
      reminders: {
        available: () => true,
        enable: log('enable'),
        schedule: log('schedule'),
        cancel: log('cancel'),
      },
    };
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('grain_tutorial_v1', '1');
    localStorage.setItem('grain_best_v1', '500');
    localStorage.setItem('grain_save_v1', sv);
    localStorage.setItem(
      'grain_meta_v1',
      JSON.stringify({ sessions: 4, reminder: 'unasked', playHours: [20, 20] }),
    );
    localStorage.setItem('grain_stats_v1', JSON.stringify({ gamesPlayed: 9 }));
  }, JSON.stringify(save));
  await page.goto(url);
  await page.waitForFunction(() => window.__grain);
  const calls = () => page.evaluate(() => window.__calls);
  check(
    'Game Center signs in at launch',
    (await calls()).some((c) => c[0] === 'signIn'),
  );
  check(
    'reminder soft-ask shows on home after a few sessions',
    await page.getByRole('button', { name: 'Yes, remind me' }).isVisible(),
  );
  await page.screenshot({ path: `${out}/flow-reminder-offer.png` });
  await page.getByRole('button', { name: 'Yes, remind me' }).click();
  await page.waitForTimeout(300);
  const sched = (await calls()).find((c) => c[0] === 'schedule');
  check(
    'accepting schedules tomorrow’s reminder at their usual hour',
    !!sched && new Date(sched[1]).getHours() === 20 && new Date(sched[1]) > new Date(),
    JSON.stringify(sched),
  );
  check(
    'the soft-ask goes away once answered',
    !(await page.getByRole('button', { name: 'Yes, remind me' }).isVisible()),
  );
  await page.getByRole('button', { name: 'Settings' }).click();
  check(
    'settings show the reminder switch, on',
    (await page.getByRole('switch', { name: 'Daily reminder' }).getAttribute('aria-checked')) === 'true',
  );
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Awards' }).click();
  check(
    'awards offer the Game Center leaderboard',
    await page.getByRole('button', { name: 'Game Center leaderboard' }).isVisible(),
  );
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await wait(page, 0.6);
  await drag(page, await slotScreen(page, 0), await worldScreen(page, -4, -4));
  await page.waitForFunction(() => window.__grain.store.getState().phase === 'over', null, {
    timeout: 60000,
  });
  await wait(page, 3.2);
  const c = await calls();
  check(
    'game over submits the best score',
    c.some((x) => x[0] === 'submitBest' && x[1] === 991),
  );
  check(
    'a new best (eligible player) asks for a review once',
    c.filter((x) => x[0] === 'review').length === 1,
  );
  await page.close();
}

// ---------------------------------------------------------------- monetization (fake ads + purchases)
{
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => (errors++, console.log('pageerror:', e.message)));
  const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
  const groups = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if ((r + c) % 2 === 1) groups.push({ cells: [[r, c]], center: [c + 0.5, r + 0.5], seed });
  const save = {
    version: 3,
    score: 700,
    streak: 0,
    misses: 0,
    sinceSmall: 0,
    revives: 0,
    rng: 9,
    groups,
    tray: [{ shapeIndex: 0, seed }, { shapeIndex: 13, seed }, null],
  };
  await page.addInitScript((sv) => {
    window.__ads = [];
    const log = (n, v) => async () => {
      window.__ads.push(n);
      return v;
    };
    window.__fakeMonetization = {
      ads: {
        start: log('start'),
        rewardedReady: () => true,
        showRewarded: log('rewarded', true),
        interstitialReady: () => true,
        showInterstitial: log('interstitial'),
        privacyOptionsRequired: () => true,
        showPrivacyOptions: log('privacy'),
      },
      purchases: {
        available: () => true,
        price: async () => '$2.99',
        owned: async () => false,
        buy: log('buy', true),
        restore: log('restore', false),
      },
    };
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('grain_tutorial_v1', '1');
    localStorage.setItem('grain_save_v1', sv);
    localStorage.setItem(
      'grain_meta_v1',
      JSON.stringify({ sessions: 6, reminder: 'off', gamesSinceAd: 5, lastAdAt: 0 }),
    );
    localStorage.setItem('grain_stats_v1', JSON.stringify({ gamesPlayed: 12 }));
  }, JSON.stringify(save));
  await page.goto(url);
  await page.waitForFunction(() => window.__grain);
  await page.waitForTimeout(300);
  const ads = () => page.evaluate(() => window.__ads);
  // one legal move through the real view path (commit), so the results card appears like in play
  const playOne = () =>
    page.evaluate(() => {
      const { store, game } = window.__grain;
      const s = store.getState();
      for (const tp of game.world.tray) {
        if (!tp || tp.anim) continue;
        for (let r = 0; r < 9; r++)
          for (let c = 0; c < 9; c++) {
            const ok = tp.shape.cells.every(
              ([a, b]) => r + a < 9 && c + b < 9 && s.game.board.grid[r + a][c + b] === 0,
            );
            if (ok) {
              tp.anim = true;
              game.commit(tp, r, c);
              return;
            }
          }
      }
    });
  check('ads start (consent → ATT → SDK) from the 2nd session', (await ads()).includes('start'));
  await page.waitForSelector('.offer-layer:not(.hidden)', { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(500);
  check(
    'launch: once ads are running, the home shows the Remove-ads offer with the price',
    await page.locator('.offer-layer').getByRole('button', { name: 'Remove ads · $2.99' }).isVisible(),
  );
  await page.screenshot({ path: `${out}/flow-offer.png` });
  await page.locator('.offer-layer').getByRole('button', { name: 'Not now' }).click();
  await page.waitForTimeout(500);
  check(
    'Not now closes the offer and it counts for pacing',
    !(await page.locator('.offer-layer .card').isVisible()) &&
      (await page.evaluate(() => window.__grain.store.getState().meta.offersToday)) === 1,
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await wait(page, 0.6);
  await drag(page, await slotScreen(page, 0), await worldScreen(page, -4, -4));
  await page.waitForFunction(() => window.__grain.store.getState().phase === 'over', null, {
    timeout: 60000,
  });
  await wait(page, 2.2);
  await page.screenshot({ path: `${out}/flow-revive-offer.png` });
  check(
    'results offer a revive for a rewarded ad',
    await page.getByRole('button', { name: 'Keep playing · watch an ad' }).isVisible(),
  );
  check(
    'results offer Remove ads while ads are running',
    await page.getByRole('button', { name: 'Tired of ads? Remove them' }).isVisible(),
  );
  await page.getByRole('button', { name: 'Keep playing · watch an ad' }).click();
  await wait(page, 0.8);
  check(
    'no second offer right after the rewarded ad (paced)',
    !(await page.locator('.offer-layer .card').isVisible()),
  );
  let st = await page.evaluate(() => window.__grain.store.getState());
  check(
    'watching the ad revives the game (fullest square cleared, playing again)',
    st.phase === 'playing' &&
      st.game.revives === 1 &&
      st.game.score === 701 &&
      (await ads()).includes('rewarded'),
  );
  await page.screenshot({ path: `${out}/flow-revived.png` });
  for (
    let i = 0;
    i < 60 && (await page.evaluate(() => window.__grain.store.getState().phase)) === 'playing';
    i++
  ) {
    await playOne();
    await wait(page, 0.1);
  }
  await page.waitForFunction(() => window.__grain.store.getState().phase === 'over', null, {
    timeout: 60000,
  });
  await wait(page, 2.2);
  check(
    'no second revive in the same game',
    !(await page.getByRole('button', { name: /Keep playing/ }).isVisible()),
  );
  await page.getByRole('button', { name: 'Play again' }).click();
  await page.waitForTimeout(500);
  st = await page.evaluate(() => window.__grain.store.getState());
  check(
    'Play again shows a paced interstitial, then a fresh game',
    (await ads()).includes('interstitial') &&
      st.phase === 'playing' &&
      st.game.score === 0 &&
      st.meta.gamesSinceAd === 0,
  );
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.pause').getByRole('button', { name: 'Settings' }).click();
  check(
    'settings offer Remove ads with the store price',
    await page.getByRole('button', { name: 'Remove ads · $2.99' }).isVisible(),
  );
  check(
    'settings offer Privacy choices when consent requires it',
    await page.getByRole('button', { name: 'Privacy choices' }).isVisible(),
  );
  await page.waitForTimeout(600);
  check(
    'no reminder switch on the web (no notifications there)',
    !(await page.getByRole('switch', { name: 'Daily reminder' }).isVisible()),
  );
  await page.screenshot({ path: `${out}/flow-settings-store.png` });
  await page.getByRole('button', { name: 'Remove ads · $2.99' }).click();
  await page.waitForTimeout(300);
  check(
    'buying Remove ads sticks (cached for offline)',
    (await page.evaluate(
      () => window.__grain.store.getState().removeAds && localStorage.getItem('grain_no_ads_v1') === '1',
    )) && (await page.getByText('Ads removed. Thank you!').isVisible()),
  );
  await page.close();
}

// ---------------------------------------------------------------- reset progress during the tutorial
{
  const page = await open({ width: 390, height: 844 });
  await wait(page, 0.6);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.pause').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(page, 1.0);
  const tutorialVisible = await page.evaluate(
    () => !document.querySelector('.tutorial').classList.contains('hidden'),
  );
  const seq = (await state(page)).moveSeq;
  await drag(page, await slotScreen(page, 0), await worldScreen(page, 0, 0));
  await wait(page, 0.6);
  check(
    'reset during the tutorial gives a normal game (no overlay, drops anywhere)',
    !tutorialVisible && (await state(page)).moveSeq > seq,
  );
  await page.close();
}

// ---------------------------------------------------------------- reset race: drop lands after a restart
{
  const page = await open({ width: 390, height: 844 }, { grain_tutorial_v1: '1' });
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(page, 1.0);
  const fire = await drag(page, await slotScreen(page, 0), await worldScreen(page, 0, 0), { hold: true });
  await wait(page, 0.3);
  // release (the 0.2 s drop starts) and restart in the same tick, before the drop lands
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
    window.__grain.store.getState().startNew();
  });
  void fire;
  await wait(page, 1.0);
  const s = await state(page);
  const groups = await page.evaluate(() => window.__grain.store.getState().game.board.groups.length);
  check(
    'a drop landing after a restart does not touch the new game',
    s.score === 0 && groups === 0 && s.tray.every((t) => t !== null),
    JSON.stringify(s),
  );
  await page.close();
}

// ---------------------------------------------------------------- background mid-drop commits and saves
{
  const page = await open({ width: 390, height: 844 }, { grain_tutorial_v1: '1' });
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(page, 1.0);
  await drag(page, await slotScreen(page, 0), await worldScreen(page, 0, 0), { hold: true });
  await wait(page, 0.3);
  await page.evaluate(() => {
    const c = document.getElementById('c');
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const s = await state(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('grain_save_v1') ?? 'null'));
  const tweens = await page.evaluate(() => window.__grain.game.debug.tweens);
  check(
    'backgrounding mid-drop commits the move, saves it and leaves nothing animating',
    s.moveSeq === 1 && saved?.score === s.score && s.score > 0 && tweens === 0 && s.phase === 'paused',
    JSON.stringify({ ...s, tweens }),
  );
  await page.close();
}

// ---------------------------------------------------------------- corrupted saves
for (const [label, raw] of [
  ['bad JSON', '{"score": 12, "groups": ['],
  [
    'unknown shape',
    JSON.stringify({
      version: 1,
      score: 5,
      streak: 0,
      rng: 1,
      groups: [],
      tray: [{ shapeIndex: 999, seed: {} }, null, null],
    }),
  ],
  [
    'overlapping blocks',
    JSON.stringify({
      version: 1,
      score: 5,
      streak: 0,
      rng: 1,
      groups: [
        { cells: [[0, 0]], center: [0, 0], seed: { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 } },
        { cells: [[0, 0]], center: [0, 0], seed: { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 } },
      ],
      tray: [null, null, null],
    }),
  ],
  ['wrong type', '"hello"'],
]) {
  const page = await open({ width: 390, height: 844 }, { grain_tutorial_v1: '1', grain_save_v1: raw });
  await wait(page, 0.3);
  const cont = await page.getByRole('button', { name: 'Continue' }).isVisible();
  const gone = (await page.evaluate(() => localStorage.getItem('grain_save_v1'))) === null;
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(page, 0.6);
  const s = await state(page);
  check(
    `corrupted save (${label}) → clean new game`,
    !cont && gone && s.phase === 'playing' && s.score === 0 && s.tray.every((t) => t !== null),
  );
  await page.close();
}

// ---------------------------------------------------------------- WebGL context loss (iOS does this in the background)
{
  const page = await open({ width: 390, height: 844 }, { grain_tutorial_v1: '1' });
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(page, 1.0);
  const before = await page.screenshot();
  await page.evaluate(() => {
    const gl = document.getElementById('c').getContext('webgl2');
    window.__lose = gl.getExtension('WEBGL_lose_context');
    window.__lose.loseContext();
  });
  await page.waitForTimeout(500);
  const lost = await page.evaluate(() => document.getElementById('c').getContext('webgl2').isContextLost());
  const during = await page.screenshot();
  check('context really was lost (frame changed)', lost && during.length !== before.length, `lost=${lost}`);
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForTimeout(1500);
  await wait(page, 0.5);
  const after = await page.screenshot({ path: `${out}/flow-context-restored.png` });
  // the restored frame should match the pre-loss frame (same board, nothing animating)
  const same = Math.abs(before.length - after.length) / before.length < 0.03;
  check('scene renders again after WebGL context loss', same, `png bytes ${before.length} → ${after.length}`);
  // and the game still plays
  const seq = (await state(page)).moveSeq;
  await drag(page, await slotScreen(page, 0), await worldScreen(page, 0, 0));
  await wait(page, 0.6);
  check('game still playable after context restore', (await state(page)).moveSeq > seq);
  await page.close();
}

await browser.close();
console.log(errors ? `${errors} console error(s)` : 'no console errors');
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed || errors ? 1 : 0);
