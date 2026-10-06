import { chromium } from 'playwright';
import fs from 'node:fs';
const [dir, t0] = [process.argv[2], Number(process.argv[3])];
const files = fs.readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
for (let s = 0; s * 8 < files.length; s++) {
  const imgs = files.slice(s * 8, s * 8 + 8).map((f) => `<div style="position:relative"><img src="data:image/png;base64,${fs.readFileSync(dir + '/' + f).toString('base64')}" style="width:390px"><b style="position:absolute;left:4px;top:4px;color:#ff0;background:#000;font:16px sans-serif">${(t0 + parseInt(f.slice(1)) / 30).toFixed(2)}s</b></div>`).join('');
  await p.setContent(`<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:4px;width:1600px">${imgs}</body>`);
  await p.screenshot({ path: `${dir}/sheet${s}.png`, fullPage: true });
}
await b.close();
