// Builds the public site in docs/ (GitHub Pages: marketing, support, privacy) from PRIVACY.md and ASO.md.
// Usage: node scripts/build-site.mjs   (npm run site)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CONTACT = 'isacmolin@gmail.com';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/(https?:\/\/[^\s)<]+[^\s).,<])/g, '<a href="$1">$1</a>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>');

/** Tiny markdown: # / ## headings, paragraphs (lines joined), bullets. */
function md(text) {
  const out = [];
  let para = [];
  let list = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith('## ')) {
      flush();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      flush();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('• ') || line.startsWith('- ')) list.push(line.slice(2));
    else para.push(line);
  }
  flush();
  return out.join('\n');
}

const page = (title, body, desc) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<style>
  body{margin:0;background:#2a170b;color:#fff6e6;font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{max-width:720px;margin:0 auto;padding:40px 22px 80px}
  nav{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:28px;font-weight:600}
  a{color:#f0b94a}
  h1{font-family:Georgia,serif;font-size:42px;line-height:1.1;margin:0 0 10px}
  h2{font-family:Georgia,serif;margin-top:34px}
  .lead{font-size:20px;color:#e9d9bd}
  .card{background:#3a2415;border:1px solid #5a3a22;border-radius:16px;padding:6px 22px 14px;margin:20px 0}
  footer{margin-top:50px;color:#c8b394;font-size:14px}
</style>
</head>
<body>
<main>
<nav><a href="index.html">Grain</a><a href="support.html">Support</a><a href="privacy.html">Privacy</a></nav>
${body}
<footer>© 2026 Isac Molin · <a href="mailto:${CONTACT}">${CONTACT}</a></footer>
</main>
</body>
</html>
`;

mkdirSync('docs', { recursive: true });

const aso = readFileSync('ASO.md', 'utf8');
const en = aso.split('## Svenska')[0];
const sv = aso.split('## Svenska')[1].split('## Screenshot')[0];
const section = (src, marker, end) => src.split(marker)[1].split(end)[0].trim();
const descEn = section(en, '**Description:**\n', '\n**What');
const descSv = section(sv, '**Beskrivning:**\n', '\n**');

writeFileSync(
  'docs/index.html',
  page(
    'Grain: Wood Block Puzzle',
    `<h1>Grain</h1><p class="lead">A calm, tactile wood block puzzle for iPhone and iPad.</p>
<div class="card">${md(descEn)}</div>
<h2>Svenska</h2><div class="card">${md(descSv)}</div>
<p><a href="support.html">Support</a> · <a href="privacy.html">Privacy policy</a></p>`,
    'Grain is a calm, tactile wood block puzzle. Drag carved blocks, clear lines, play daily challenges.',
  ),
);

writeFileSync(
  'docs/support.html',
  page(
    'Grain — Support',
    `<h1>Grain support</h1>
<p class="lead">Questions, bugs or ideas? We read everything.</p>
${md(`## Contact
Email: ${CONTACT}. We answer within 1–3 business days.

## Reporting a problem
Please include your device, iOS version, the Grain version (Settings → bottom of the list) and what you were doing.

## Restore purchases
Open Grain → Settings → **Restore purchases**. Use the same Apple ID you bought with. Remove ads is a one-time purchase and works on all your devices.

## My game progress is missing
Progress is stored only on your device, so deleting the app removes it. Game Center keeps your best score and achievements.

## How do the modes work?
Classic is the original game. Daily challenge gives everyone the same pieces and a new goal each day. Zen never ends: when you get stuck, the fullest square clears. Blitz gives you two minutes. Three daily quests unlock the Oak and Mahogany woods when you finish them several days in a row.

## Ads
Free Grain shows an ad between some games and offers an optional ad for a second chance. Remove ads (one purchase) removes them. Ad choices: Settings → Privacy choices.

## Requirements
iPhone or iPad with iOS 15 or later.`)}`,
    'Grain support: contact, restore purchases and answers to common questions.',
  ),
);

const priv = readFileSync('PRIVACY.md', 'utf8').replace(/^_Draft[^\n]*\n/m, '');
writeFileSync(
  'docs/privacy.html',
  page(
    'Grain — Privacy Policy',
    md(priv),
    'Grain privacy policy: no accounts, no servers, ads by Google AdMob, purchases by Apple and RevenueCat.',
  ),
);

// AdMob verifies this file at the developer's site root; kept here for reference only.
writeFileSync('docs/.nojekyll', '');
console.log('docs/ built');
