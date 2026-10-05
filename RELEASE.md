# Release runbook — Grain 1.0

Everything below the line "you" needs your accounts, a Mac or real phones. The rest is automated.

## Every change (Windows or Mac)
1. `npm run typecheck && npm run lint && npm test`
2. With `npm run dev` running in another terminal: `npm run flows`, `npm run layout`, `npm run soak`
3. `npm run prod-check` — production build: no errors, no network, accessibility

## One-time account setup (you) — `STORE.md`
1. App Store Connect app + Game Center (leaderboard + 13 achievements) + `grain_remove_ads` IAP
2. RevenueCat project → key into `PURCHASES.revenueCatKey`
3. AdMob app + 2 ad units + consent messages → ids into `ADS`, `testMode: false`
4. Fill in and publish `PRIVACY.md`; support page
5. `npm run release-check` must say **Ready to archive in Xcode.**

## Build for TestFlight (you, on a Mac)
1. `npm install`
2. Bump `iosBuild` in `package.json` for every upload (and `version` for a new App Store version)
3. `npm run ios:open` (builds, syncs, patches, opens Xcode)
4. Xcode → App target → Signing & Capabilities → your team (Game Center + In-App Purchase appear from the entitlements)
5. Product → Archive → Distribute App → App Store Connect
6. TestFlight: internal testers first, then 10–20 external testers for at least a week

## Device test pass (you) — RELEASE_CHECKLIST phase 11
- iPhone SE, a standard iPhone, a Pro Max, an iPad — portrait and landscape
- Fresh install (tutorial), update over an existing save, airplane mode, Low Power Mode
- 60 fps on an iPhone XR/11, 120 fps on a ProMotion iPhone (Xcode → Debug navigator)
- Purchases + restore with a sandbox account; ads with test ids, then real ids on TestFlight
- Silent switch mutes the game; music stops in the background; haptics feel right
- Run `PLAYTEST.md` with 10+ people who have never seen the game

## Submit (you)
1. Listing: paste from `ASO.md` (en + sv), upload `store/` screenshots (`npm run store-shots`)
2. App Privacy answers: `STORE.md` §4 · Age rating 4+ · not "Made for Kids"
3. Review notes: `ASO.md`
4. Submit for review; release manually so you can watch the first day
