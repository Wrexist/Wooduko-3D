// Pre-release gate: fails on anything that must not ship. Usage: npm run release-check
// (runs a production build; does not need the dev server)
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const results = [];
const check = (name, ok, fix) => results.push({ name, ok, fix });

const config = readFileSync('src/config.ts', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const GOOGLE_TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

check(
  'Ads: test mode off',
  /testMode:\s*false/.test(config),
  'set ADS.testMode = false in src/config.ts (after adding real ids)',
);
check(
  'Ads: real AdMob ids (not Google test ids)',
  !config.includes(GOOGLE_TEST_PUBLISHER),
  'put your AdMob app + ad unit ids in ADS (STORE.md §3)',
);
check(
  'Purchases: RevenueCat key set',
  /revenueCatKey:\s*'appl_[A-Za-z0-9]+'/.test(config),
  'PURCHASES.revenueCatKey = your public iOS SDK key (STORE.md §2)',
);
check(
  'Privacy policy: no [placeholders]',
  !/\[[^\]]+\]/.test(readFileSync('PRIVACY.md', 'utf8')),
  'fill in PRIVACY.md and publish it',
);
check('Version is semver', /^\d+\.\d+\.\d+$/.test(pkg.version), 'package.json version like 1.0.0');
check(
  'iOS build number is a positive integer',
  Number.isInteger(pkg.iosBuild) && pkg.iosBuild > 0,
  'package.json iosBuild',
);

const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
check(
  'iOS project version matches package.json',
  pbx.includes(`MARKETING_VERSION = ${pkg.version};`) &&
    pbx.includes(`CURRENT_PROJECT_VERSION = ${pkg.iosBuild};`),
  'npm run ios:sync',
);
const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
for (const key of [
  'CADisableMinimumFrameDurationOnPhone',
  'ITSAppUsesNonExemptEncryption',
  'NSUserTrackingUsageDescription',
  'GADApplicationIdentifier',
  'SKAdNetworkItems',
]) {
  check(`Info.plist has ${key}`, plist.includes(`<key>${key}</key>`), 'npm run ios:sync');
}
check('Privacy manifest bundled', pbx.includes('PrivacyInfo.xcprivacy in Resources'), 'npm run ios:sync');

const grep = (dir, re) =>
  readdirSync(dir, { recursive: true })
    .filter((f) => /\.(ts|css)$/.test(f))
    .flatMap((f) =>
      readFileSync(`${dir}/${f}`, 'utf8')
        .split('\n')
        .map((l, i) => [f, i + 1, l]),
    )
    .filter(([, , l]) => re.test(l));
const todos = grep('src', /\b(TODO|FIXME|XXX|lorem)\b/i);
check('No TODO / FIXME / lorem in src', todos.length === 0, todos.map(([f, n]) => `${f}:${n}`).join(', '));

execSync('npx vite build', { stdio: 'pipe' });
const js = readdirSync('dist/assets')
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(`dist/assets/${f}`, 'utf8'))
  .join('\n');
check(
  'Production build has no debug hooks',
  !js.includes('__grain') && !js.includes('__fakeServices'),
  'debug hooks must be dead-code eliminated',
);
check(
  'Production build makes no external font/CDN requests',
  !/fonts\.googleapis|cdn\.jsdelivr|unpkg\.com/.test(js),
  'self-host everything',
);

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  → ${r.fix}`}`);
}
console.log(failed ? `\n${failed} release blocker(s).` : '\nReady to archive in Xcode.');
process.exit(failed ? 1 : 0);
