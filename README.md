# Grain — 3D wood block puzzle

A clean, tactile Woodoku-style block puzzle with real 3D carved wood blocks, built with Three.js.
Place blocks on a 9×9 board and clear rows, columns and 3×3 squares.

Status: **playable prototype** (v0.1.0). See `RELEASE_CHECKLIST.md` for the road to release and `POLISH.md` for the feel/visual backlog.

## Run it

```bash
npm install        # first time only: downloads the libraries
npm run dev        # starts a local server; open the URL it prints (also works on your phone on the same Wi-Fi)
npm run build      # makes the production version in dist/
```

`prototype/grain.html` is the original single-file prototype. It opens straight in a browser with no install and is kept as a reference.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page shell, HUD and CSS |
| `src/main.js` | Entry point |
| `src/three-global.js` | Exposes the bundled Three.js as `window.THREE` (temporary, until the TS port) |
| `src/game.js` | The whole game runtime (to be split into modules in phase 1) |
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
