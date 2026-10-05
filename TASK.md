# TASK.md

## Active phase
**Phase 2 — Hardening** — **complete, waiting for sign-off.** Next: Phase 3 — Gameplay tuning.

## Phase 2 plan
1. [x] **Reset races:** a drop, game-over card or tutorial step that finishes *after* a restart must not touch the new game (generation guard on delayed callbacks; commit checks the tray piece is still current)
2. [x] **Rotate/resize mid-drag:** re-aim the dragged piece from the last pointer position on resize (not only on the next move)
3. [x] **Backgrounding mid-animation:** finish all tweens on background so a pending drop commits and saves; resume audio from iOS "interrupted"
4. [x] **WebGL context loss** (iOS does this in the background): keep the loop alive, verify the scene comes back
5. [x] **Corrupted save in the browser:** bad JSON / bad shapes / finished game → clean new game, no console errors (plus unit test: loaded game-over save is dropped)
6. [x] **Small and large screens:** 320×568, 568×320, 375×667, iPad portrait/landscape, 1366×1024: board + tray fully on screen and below the HUD; HUD, toasts and cards never overflow (narrow phones drop the HUD restart button — it stays in the pause menu)
7. [x] **30-minute soak:** passed — 14,927 moves, 180 games, geometries/textures/programs/DOM flat, heap 21.7 → 10.6 MB. `renderer.info` (geometries, textures, programs), JS heap, DOM nodes and tween count flat
- Out of scope, needs your call: error tracking (Sentry) sends data off the device — ask before adding

Verification: `npm run flows` (39 checks), `npm run layout` (13 viewports), `npm run soak` / 30-min soak on `npm run build:test` + `serve:test`.

Files: `src/game.ts`, `src/input/drag.ts`, `src/ui/styles.css`, `src/audio/sound.ts`, `scripts/flows.mjs`, new `scripts/layout.mjs`, `scripts/soak.mjs`, `tests/store.test.ts`
Risks: SwiftShader is slow, so the 30-min soak runs in the background; context-loss restore depends on Three's internal handling.

## Phase 1 (done)

### Step 1 — Scaffold (tooling only, no game code)
- [x] Unpack `grain-repo.zip` into the repo root, delete the zip
- [x] TypeScript strict `tsconfig.json` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] Vitest (`npm test`), ESLint flat config + typescript-eslint, Prettier
- [x] Scripts: `dev`, `build`, `typecheck`, `test`, `lint`, `format`
- [x] Module folders from the architecture with `config.ts` + `core/types.ts`
- [x] Update `CLAUDE.md`: Three.js r128 pin lifted (master prompt wins), new layout

### Step 2 — `core/` port + tests (pure, no DOM/Three)
- [x] `types.ts`, `shapes.ts` (39 orientations, prototype order kept so old saves load), `board.ts`, `scoring.ts`, `generator.ts` (xorshift32 RNG, weighted tray, 40 retries), `rules.ts` (`playMove` reducer, game over, streak), `save.ts` (v1 + v0 prototype migration, validation)
- [x] `state/store.ts` (Zustand vanilla) + `platform/storage.ts`

### Step 3 — Render / input / FX / audio / HUD rebuild
- [x] Three.js 0.186.1 pinned; SRGB output, ACES, physical lights (r128 × π, retuned), soft PCF shadows
- [x] Renderer (adaptive pixel ratio), fit-to-bounds camera with view offset, procedural tileable textures, carved table + ridges
- [x] One carved block per piece (outline trace → inset → rounded → beveled extrude, per-block ring UVs)
- [x] Drag: line-of-sight hover, touch offset, smoothing + tilt, hysteresis + magnet, ghost + gold clear preview, drop / fly-back, mouse hover
- [x] FX: pops + chips, sweeps with travelling sparkle head, shock + landing rings, punch, shake, flash, board clear, game-over fade
- [x] Audio: WebAudio synth SFX + quiet generative music, unlock on first touch
- [x] HUD, toast tiers, float text, combo pill, results card; self-hosted fonts (zero network)
- [x] Shader pre-warm (pop, ghost, sweeps incl. box glow, chips, sparkles)
- [x] `legacy/` deleted

### Step 4 — Menus & tutorial
- [x] Home (Play / Continue / Settings / best), pause menu (Resume / Restart / Settings / Home)
- [x] Settings (sound effects, music, haptics, reduce motion, reset progress with confirm)
- [x] Restart confirm dialog (replaces the "tap twice" toast); Escape closes dialogs / pauses
- [x] 3-step skippable tutorial (row, column, 3×3 square) with a pointing hand; first run only

### Accept when
- [x] Every rule in master prompt §4 unit-tested and green (109 tests)
- [x] Full game playable portrait + landscape (`npm run flows`: 29 checks)
- [x] No console errors (`npm run shots`, `npm run flows`, `npm run soak`)
- [x] Screenshots reviewed (empty board, drag + preview, mid multi-clear; menus; tutorial; game over)

## Verification tools (need `npm run dev` running)
- `npm run shots` — portrait + landscape screenshots of empty board, drag with preview, mid-clear → `shots/`
- `npm run flows` — tutorial, menus, save/reload, game over, touch offset, second finger, rotate mid-drag, background mid-drag
- `npm run soak` — 200 moves through the real commit + FX path; fails if GPU geometry/texture counts grow

## Notes for Phase 2
- 30-minute soak: `node scripts/soak.mjs 3000` (the 300-move run is flat)
- iPad / 320 px tray bounds not yet checked
- Combo rule decision is Phase 3

## Done
- [x] Playable prototype: 3D carved blocks, ghost preview, clear FX, combos, save/resume (v0.1.0)
- [x] Phase 1 rebuild (v0.2.0)
