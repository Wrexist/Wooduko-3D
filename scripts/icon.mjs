// Renders the app icon and launch screen from the real scene (needs `npm run dev` running).
// Usage: node scripts/icon.mjs [url]
// Writes assets/icon-only.png (1024², opaque) and assets/splash.png / splash-dark.png (2732²),
// the inputs `npx @capacitor/assets generate` expects (phase 7).
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
mkdirSync('assets', { recursive: true });

const seed = (a, t = 0.92) => ({ a, s: 1.05, jx: 0, jy: 0, t });
// a little composition in the board's top-left 3×3 box: an L, a bar and a single, one gap
const save = {
  version: 2,
  score: 0,
  streak: 0,
  misses: 0,
  sinceSmall: 0,
  rng: 1,
  groups: [
    {
      cells: [
        [3, 3],
        [4, 3],
        [4, 4],
      ],
      center: [3.9, 4.2],
      seed: seed(0.6),
    },
    {
      cells: [
        [3, 4],
        [3, 5],
      ],
      center: [5, 3.5],
      seed: seed(2.1, 0.95),
    },
    {
      cells: [
        [5, 3],
        [5, 4],
        [5, 5],
      ],
      center: [4.5, 5.5],
      seed: seed(4.0, 0.9),
    },
  ],
  tray: [null, { shapeIndex: 0, seed: seed(1) }, null],
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function render(size, out, frame) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.addInitScript((s) => {
    localStorage.clear();
    localStorage.setItem('grain_tutorial_v1', '1');
    localStorage.setItem('grain_save_v1', s);
    localStorage.setItem('grain_settings_v1', JSON.stringify({ sound: false, music: false }));
  }, JSON.stringify(save));
  await page.goto(url);
  await page.waitForFunction(() => window.__grain);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(1500);
  await page.evaluate((f) => {
    document.getElementById('ui').style.display = 'none';
    const { world, tweens } = window.__grain.game;
    tweens.finishAll();
    for (const t of world.tray) if (t) t.pivot.visible = false;
    const cam = world.camera;
    cam.clearViewOffset();
    cam.fov = f.fov;
    // look at the middle box from almost straight above, a touch from the front
    world.camBase.set(f.x, f.y, f.z);
    cam.position.copy(world.camBase);
    cam.lookAt(f.tx, -0.6, f.tz);
    cam.updateProjectionMatrix();
  }, frame);
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, omitBackground: false });
  await page.close();
}

await render(1024, 'assets/icon-only.png', { fov: 30, x: 0.05, y: 6.2, z: 2.4, tx: 0, tz: 0.1 });
await render(1024, 'assets/icon-foreground.png', { fov: 30, x: 0.05, y: 6.2, z: 2.4, tx: 0, tz: 0.1 });

// launch screen: the icon + wordmark on the page colour, so the hand-off to the first frame
// (home card on the same dark wood colour) has no flash
const icon = `data:image/png;base64,${readFileSync('assets/icon-only.png').toString('base64')}`;
const font = `data:font/woff2;base64,${readFileSync('public/fonts/fraunces-latin-800-normal.woff2').toString('base64')}`;
for (const [name, bg] of [
  ['splash', '#3a2415'],
  ['splash-dark', '#26170d'],
]) {
  const page = await browser.newPage({ viewport: { width: 2732, height: 2732 } });
  await page.setContent(`<style>@font-face{font-family:F;src:url(${font})}body{margin:0;width:2732px;height:2732px;display:grid;place-items:center;background:${bg}}
    .c{display:grid;justify-items:center;gap:90px}
    img{width:560px;height:560px;border-radius:124px;box-shadow:0 40px 120px rgba(0,0,0,.45)}
    h1{margin:0;font:800 170px F;color:#fff6e6;letter-spacing:-2px;text-shadow:0 8px 0 rgba(60,30,12,.55)}</style>
    <div class="c"><img src="${icon}"><h1>Grain</h1></div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `assets/${name}.png` });
  await page.close();
}
// web icons (favicon, home screen) from the same render
for (const [file, px] of [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
  ['public/favicon-32.png', 32],
]) {
  const page = await browser.newPage({ viewport: { width: px, height: px } });
  await page.setContent(
    `<body style="margin:0"><img src="${icon}" style="width:${px}px;height:${px}px;display:block"></body>`,
  );
  await page.screenshot({ path: file });
  await page.close();
}
await browser.close();
console.log(
  'wrote assets/icon-only.png, assets/icon-foreground.png, assets/splash.png, assets/splash-dark.png',
);
