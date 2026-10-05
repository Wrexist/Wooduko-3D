# TASK.md

## Active phase
**Phase 1 — Rebuild & feature completion** (spec: `MASTER_PROMPT.md`) — **complete, waiting for sign-off.**
Next: Phase 2 — Hardening (do not start until confirmed).

## Plan

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
