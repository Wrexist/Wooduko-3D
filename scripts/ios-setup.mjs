// Applies Grain's native iOS setup to the Capacitor project in ios/ (idempotent, safe to re-run
// after `npx cap add ios` or a Capacitor upgrade):
//  - copies the in-repo Swift sources (native/ios) and adds them to the Xcode target
//  - uses GrainViewController (registers the Game Center plugin) in Main.storyboard
//  - Game Center entitlement
//  - Info.plist: 120 Hz on ProMotion, no-encryption export flag, arm64, en + sv localisations
//  - app icon (opaque 1024) and launch images
// Usage: node scripts/ios-setup.mjs
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pngToRgb } from './png-rgb.mjs';

const require = createRequire(import.meta.url);
const xcode = require('xcode');

const APP = 'ios/App/App';
const PBX = 'ios/App/App.xcodeproj/project.pbxproj';
if (!existsSync(PBX)) {
  console.error('ios/ not found: run `npx cap add ios` first');
  process.exit(1);
}

// ---------- Swift sources ----------
const sources = ['GrainGameCenterPlugin.swift', 'GrainViewController.swift'];
for (const f of sources) copyFileSync(`native/ios/${f}`, `${APP}/${f}`);
const proj = xcode.project(PBX);
proj.parseSync();
const appGroup = proj.findPBXGroupKey({ name: 'App' }) ?? proj.findPBXGroupKey({ path: 'App' });
for (const f of sources) {
  if (!proj.hasFile(f)) proj.addSourceFile(f, null, appGroup);
}

// ---------- entitlements (Game Center) ----------
writeFileSync(
  `${APP}/App.entitlements`,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.game-center</key>
	<true/>
</dict>
</plist>
`,
);
const configs = proj.pbxXCBuildConfigurationSection();
for (const [key, cfg] of Object.entries(configs)) {
  if (key.endsWith('_comment') || !cfg.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) continue;
  cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = 'App/App.entitlements';
}
writeFileSync(PBX, proj.writeSync());

// ---------- storyboard: our view controller ----------
const sb = `${APP}/Base.lproj/Main.storyboard`;
writeFileSync(
  sb,
  readFileSync(sb, 'utf8').replace(
    /customClass="CAPBridgeViewController" customModule="Capacitor"/,
    'customClass="GrainViewController" customModule="App" customModuleProvider="target"',
  ),
);

// ---------- Info.plist ----------
const plistPath = `${APP}/Info.plist`;
let plist = readFileSync(plistPath, 'utf8');
const addKey = (key, xml) => {
  if (!plist.includes(`<key>${key}</key>`)) plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`);
};
// unlock 120 Hz on ProMotion iPhones
addKey('CADisableMinimumFrameDurationOnPhone', '<true/>');
// no custom encryption: skips the export-compliance question on every upload
addKey('ITSAppUsesNonExemptEncryption', '<false/>');
addKey('CFBundleLocalizations', '<array>\n\t\t<string>en</string>\n\t\t<string>sv</string>\n\t</array>');
addKey('UIStatusBarStyle', '<string>UIStatusBarStyleLightContent</string>');
plist = plist.replace('<string>armv7</string>', '<string>arm64</string>');
writeFileSync(plistPath, plist);

// ---------- icon + launch images ----------
writeFileSync(`${APP}/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, pngToRgb(readFileSync('assets/icon-only.png')));
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  copyFileSync('assets/splash.png', `${APP}/Assets.xcassets/Splash.imageset/${f}`);
}

console.log('iOS project patched: Swift plugin, entitlements, storyboard, Info.plist, icon, splash');
