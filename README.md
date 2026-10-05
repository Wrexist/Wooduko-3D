# Grain — 3D wood block puzzle

A clean, tactile Woodoku-style block puzzle with real 3D carved wood blocks, built with Three.js.
Place blocks on a 9×9 board and clear rows, columns and 3×3 squares.

Status: **v1.0.0 release candidate.** Code complete through phase 11; the remaining steps need your accounts, a Mac and real phones — see `RELEASE.md`.

## Run it

```bash
npm install        # first time only: downloads the libraries
npm run dev        # starts a local server; open the URL it prints (also works on your phone on the same Wi-Fi)
npm run build      # makes the production version in dist/
npm test           # runs the rule tests
npm run typecheck  # checks the TypeScript
npm run lint       # checks code style
npm run sim        # bot playtest: hundreds of simulated games, report in shots/playtest.md (~5 min)
```

With `npm run dev` running in another terminal: `npm run shots` (screenshots), `npm run flows` (clicks through the whole game), `npm run layout` (13 screen sizes), `npm run soak` (memory leak check), `npm run store-shots` (App Store screenshots), `npm run icons` (icon + launch screen).
Without it: `npm run sim` (bot playtest), `npm run prod-check` (production build), `npm run release-check` (ship blockers).

Docs: `DESIGN.md` (rules), `RELEASE.md` (how to ship), `STORE.md` (account setup), `ASO.md` (listing), `PRIVACY.md` (policy draft), `PLAYTEST.md`.

`prototype/grain.html` is the original single-file prototype. It opens straight in a browser with no install and is kept as a reference.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page shell |
| `src/main.ts` | Boot: storage, store, game |
| `src/config.ts` | Every tunable number |
| `src/core/` | Pure game rules (no DOM, no Three.js), fully unit-tested |
| `src/state/store.ts` | Game/UI state (Zustand) and saving |
| `src/render/`, `src/fx/`, `src/input/`, `src/audio/`, `src/ui/` | Scene, effects, dragging, sound, menus |
| `src/game.ts` | Wires state to scene, effects, sound, UI and input |
| `src/platform/` | Storage / haptics / lifecycle adapters (Capacitor in phase 7) |
| `tests/` | Vitest specs |
| `scripts/` | Screenshot, flow and soak checks (Playwright) |
| `capacitor.config.json` | iOS/Android wrapper settings (bundle id `com.wrexist.grain`) |
| `CLAUDE.md` | Rules for coding agents working in this repo |
| `TASK.md` / `LEARNINGS.md` / `IDEAS.md` | Session handoff, lessons learned, parked ideas |

## iOS app

The iOS project lives in `ios/` (Capacitor 8, Swift Package Manager). On a Mac with Xcode:

```bash
npm install
npm run ios:open   # builds the web app, copies it into ios/, applies scripts/ios-setup.mjs, opens Xcode
```

In Xcode: select the **App** target → Signing & Capabilities → choose your team, then Run on a device.
`npm run icons` re-renders the app icon and launch screens (needs `npm run dev` running).
