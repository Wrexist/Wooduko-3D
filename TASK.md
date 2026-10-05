# TASK.md

## Active phase
**Phase 5 — Retention & live ops** — logic + triggers complete; native implementations land in phase 7.

## Phase 5 plan
Native pieces arrive with Capacitor in phase 7; this phase builds the rules, the adapter and the triggers.
1. [x] **Rules (pure `core/retention.ts`):** session count, review eligibility (strong moment only: a new best; ≥3 sessions, ≥5 games, ≥60 days apart, ≤3 asks), reminder offer (after 3 sessions, asked once), reminder time (tomorrow at the hour they usually play; re-scheduled every launch, so it never fires on a day they played)
2. [x] **Platform adapter `platform/services.ts`:** Game Center (sign in, submit best, report achievement, show leaderboard), review prompt, local reminders. Web = unavailable/no-op. Native = phase 7 (official `@capacitor/local-notifications`, `@capacitor-community/in-app-review`, small in-repo Swift Game Center plugin — the only CAP 8 Game Center packages are single-maintainer forks).
3. [x] **Triggers:** submit best on game over, report achievements on unlock, review on the results card of a new best, reminder soft-ask on home ("Not now" / "Yes"), Settings toggle when available, Leaderboard button in Awards when available
4. [x] **Persistence + tests**
- Skipped: remote config [nice] needs a server (no backend in v1).

## Phase 4 plan
1. [x] **Scoring table final:** document the table, confirm with the bot sim that scores stay meaningful into the thousands (no change unless the numbers say so)
2. [x] **Stats** (pure `core/progress.ts`, persisted): games played, best, average, lines cleared, best combo, board clears, biggest clear, pieces placed. Tutorial never counts.
3. [x] **Achievements** (local now, Game Center ids in phase 5): first clear, combo ×3, combo ×5, triple clear, 4+ clear, board clear, 1k / 5k / 10k points, 10 games, 500 lines. Unlock banner + chime that never blocks play.
4. [x] **Wood themes** (cosmetic, unlocked by achievements): maple (default), walnut, cherry, birch, driftwood, ebony. Textures are redrawn in place, so no GPU churn. Picker with locked hints.
5. [x] **Awards screen** (home + pause): stats grid, wood themes, achievement list
- Not now: daily streak reward [nice]; Game Center (phase 5, native).

Files: new `src/core/progress.ts`, `src/ui/awards.ts`, `src/render/themes.ts`; `config.ts`, `state/store.ts`, `render/textures.ts`, `game.ts`, `ui/menus.ts`, tests.
Risks: theme palettes need screenshot review (dark woods vs. the dark board); retexturing must not leak (soak).

## Phase 3 plan
1. [x] **Bot playtest simulator** (`npm run sim`): skilled + casual bots play hundreds of games on the pure core; report game length, scores, unplayable trays, small-piece droughts, combo frequency, piece mix by score. Baseline first.
2. [x] **Fair generator:** guaranteed fit (fallback picks a fitting shape when re-rolls fail), drought guard (a small piece at least every N pieces), mild difficulty ramp (big pieces slightly more likely as score climbs). All numbers in `GENERATOR`.
3. [x] **Combo rule:** compare strict (current) vs a grace of 1–2 misses with the sim; pick, put it in `config.ts`, document why. If grace wins: HUD pill shows "at risk" after a miss.
4. [x] **Save v2:** generator drought counter + combo misses persist; v1 → v2 migration + tests.
5. [x] **Playtest notes** in `LEARNINGS.md` (bot numbers before/after). Human playtest of 10+ people is yours to run — I'll write a short script for it.
- Not in this phase: "almost there" hint, daily puzzle (later / IDEAS).

Files: `src/core/generator.ts`, `src/core/rules.ts`, `src/core/types.ts`, `src/core/save.ts`, `src/config.ts`, `src/ui/combo.ts`, new `tests/sim/`, `vitest.sim.config.ts`
Risks: bots are not people — use them for relative comparisons (before/after), not absolute difficulty.

## Phase 2 (done)
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
