# Grain — 3D wood block puzzle

A clean, tactile Woodoku-style block puzzle with real 3D carved wood blocks, built with Three.js.
Place blocks on a 9×9 board and clear rows, columns and 3×3 squares.

Status: **Phase 1 rebuild complete** (v0.2.0): TypeScript + Three.js, home/pause/settings, tutorial. See `RELEASE_CHECKLIST.md` for the road to release and `POLISH.md` for the feel/visual backlog.

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

With `npm run dev` running in another terminal: `npm run shots` (screenshots), `npm run flows` (clicks through the whole game), `npm run soak` (memory leak check).

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

## Add the iOS app (when you get to phase 7)

```bash
npm install @capacitor/core @capacitor/ios @capacitor/haptics @capacitor/preferences
npm install -D @capacitor/cli
npx cap add ios
npm run cap:ios    # builds, syncs and opens Xcode
```
