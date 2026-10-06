// Journey check (needs `npm run dev`): home button, map, level card, a level with crates + gems,
// goal pills, gem collection, out of moves → +5 moves, a won level with stars → next level.
// Usage: node scripts/journey.mjs [url] [outDir]
import { chromium } from 'playwright';

const [url = 'http://localhost:5173/', out = 'shots'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let errors = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const page = await browser.newPage({ locale: 'en-US', viewport: { width: 390, height: 844 } });
page.on('console', (m) => m.type() === 'error' && (errors++, console.log('console.error:', m.text())));
page.on('pageerror', (e) => (errors++, console.log('pageerror:', e.message)));
await page.addInitScript(() => {
  // the fake ad service: a rewarded ad that is always ready
  window.__fakeMonetization = {
    ads: {
      start: async () => {},
      rewardedReady: () => true,
      showRewarded: async () => true,
      interstitialReady: () => false,
      showInterstitial: async () => {},
      privacyOptionsRequired: () => false,
      showPrivacyOptions: async () => {},
    },
    purchases: {
      available: () => false,
      price: async () => null,
      owned: async () => false,
      buy: async () => false,
      restore: async () => false,
    },
  };
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('grain_tutorial_v1', '1');
});
await page.goto(url);
await page.waitForFunction(() => window.__grain);
const clock = () => page.evaluate(() => window.__grain.game.debug.clock);
const wait = async (s) => {
  const t0 = await clock();
  await page.waitForFunction((t) => window.__grain.game.debug.clock >= t, t0 + s, { timeout: 120000 });
};
const st = () =>
  page.evaluate(() => {
    const s = window.__grain.store.getState();
    return {
      mode: s.mode,
      phase: s.phase,
      outcome: s.outcome,
      run: s.run,
      stars: s.runStars,
      journey: s.journey,
    };
  });
const playOne = () =>
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

await wait(0.5);
check('home shows the Journey button', (await page.locator('.journey-btn').innerText()).includes('Level 1'));
await page.screenshot({ path: `${out}/journey-home.png` });
await page.locator('.journey-btn').click();
await wait(0.6);
check(
  'map opens with level 1 current and level 2 locked',
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.stone')];
    return s[0].classList.contains('current') && s[1].classList.contains('locked') && s.length === 100;
  }),
);
await page.screenshot({ path: `${out}/journey-map.png` });
await page.locator('.stone').first().click();
await wait(0.4);
check('level card lists goals and moves', (await page.locator('.level-sheet').innerText()).includes('Score'));
await page.screenshot({ path: `${out}/journey-level-card.png` });
await page.locator('.level-sheet .cta').click();
await wait(1);
let s = await st();
check('level 1 starts in Journey mode', s.mode === 'journey' && s.run?.n === 1 && s.phase === 'playing');
check(
  'hud shows moves and goal pills',
  (await page.locator('.hud .goals .goal').count()) === 1 &&
    /\d+/.test(await page.locator('.hud .chip').innerText()),
);

// a level with crates and gems
await page.evaluate(() => window.__grain.store.getState().playLevel(3));
await wait(1);
await page.screenshot({ path: `${out}/journey-gems.png` });
check(
  'gem level: every gem is on the board',
  await page.evaluate(() => {
    const r = window.__grain.store.getState().run;
    return r.gems.length > 0 && window.__grain.game.levelDecor.gems.size === r.gems.length;
  }),
);
await page.evaluate(() => window.__grain.store.getState().playLevel(4));
await wait(1);
check(
  'crate level: crates on the board are stained',
  await page.evaluate(() => {
    const r = window.__grain.store.getState().run;
    return r.crates.length > 0 && window.__grain.game.world.crates.size === r.crates.length;
  }),
);
await page.screenshot({ path: `${out}/journey-crates.png` });

// out of moves → +5 moves
await page.evaluate(() => {
  const { store } = window.__grain;
  store.setState({ run: { ...store.getState().run, movesLeft: 1 } });
});
await playOne();
await page.waitForFunction(() => window.__grain.store.getState().phase === 'over', null, { timeout: 30000 });
await page.waitForSelector('.results:not(.hidden)', { timeout: 60000 });
await wait(1);
s = await st();
check('out of moves ends the attempt', s.outcome === 'outOfMoves' || s.outcome === 'won', s.outcome);
if (s.outcome === 'outOfMoves') {
  check(
    'results offer +5 moves',
    (await page.locator('.results .revive').isVisible()) &&
      (await page.locator('.results .revive').innerText()).includes('+5'),
    JSON.stringify(
      await page.evaluate(() => {
        const s = window.__grain.store.getState();
        return [s.outcome, s.run.extras, s.phase];
      }),
    ),
  );
  await page.screenshot({ path: `${out}/journey-out-of-moves.png` });
  const vis = await page.locator('.results .revive').isVisible();
  if (!vis)
    console.log(
      'DEBUG revive hidden',
      JSON.stringify(
        await page.evaluate(() => {
          const s = window.__grain.store.getState();
          return {
            outcome: s.outcome,
            run: s.run,
            phase: s.phase,
            removeAds: s.removeAds,
            ready: window.__fakeMonetization?.ads.rewardedReady(),
          };
        }),
      ),
    );
  await page.locator('.results .revive').click({ timeout: 5000 });
  await wait(1);
  s = await st();
  check(
    '+5 moves puts the level back in play',
    s.phase === 'playing' && s.run.movesLeft === 5 && s.run.extras === 1,
  );
}

// win level 1 → stars, unlock, next level
await page.evaluate(() => window.__grain.store.getState().playLevel(1));
await wait(0.8);
await page.evaluate(() => {
  const { store } = window.__grain;
  store.setState({ game: { ...store.getState().game, score: 5000 } });
});
await playOne();
await page.waitForSelector('.results:not(.hidden)', { timeout: 60000 });
await wait(1.6);
s = await st();
check(
  'winning gives stars and unlocks level 2',
  s.outcome === 'won' && s.stars === 3 && (s.journey.stars[0] ?? 0) === 3,
);
check('results show three gold stars', (await page.locator('.result-stars i.on').count()) === 3);
await page.screenshot({ path: `${out}/journey-won.png` });
await page.locator('.results .stack .cta').last().click();
await wait(1);
s = await st();
check('Next level starts level 2', s.run?.n === 2 && s.phase === 'playing');

console.log(`\n${failed ? `${failed} FAILED` : 'all passed'}, ${errors} console errors`);
await browser.close();
process.exit(failed || errors ? 1 : 0);
