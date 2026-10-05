# TASK.md

## Active phase
**Phase 7 — Performance / mobile (native iOS)** (`RELEASE_CHECKLIST.md` phase 7)

## Phase 7 plan
1. [x] **Capacitor 8 iOS project** (Swift Package Manager, no CocoaPods): bundle id `com.wrexist.grain`, `contentInset: never`, light status bar, launch screen hidden on the first frame
2. [x] **`scripts/ios-setup.mjs`** (idempotent, re-run after `cap add/sync`): in-repo Swift Game Center plugin + view controller, Game Center entitlement, `CADisableMinimumFrameDurationOnPhone` (120 Hz), `ITSAppUsesNonExemptEncryption = false`, arm64, en + sv, opaque 1024 icon, launch images
3. [x] **Native adapters** (`platform/native.ts`, lazy-loaded only in the app): Preferences storage with one-time localStorage migration, Taptic haptics, Game Center, in-app review, local notifications
4. [x] **Audio:** `audioSession.type = 'ambient'` (respects the silent switch, mixes with other apps), music pauses in background
5. [ ] **On a Mac (you):** `npm run ios:open`, pick your team in Signing, run on a device. Then: 60 fps on an iPhone XR/11, 120 fps on a 13 Pro+, cold start < 2 s, input latency. See RELEASE_CHECKLIST phase 7.
6. [ ] **App Store Connect (you):** enable Game Center for the app id; create leaderboard `grain.best` and achievements `grain.<id>` (ids in DESIGN.md)
- Android: not shipping in v1.

## Phase 6 plan
1. [x] **Contact shading:** baked ambient occlusion on block sides (darker toward the floor) + a procedural normal map so the grain has relief
2. [x] **Ghost never fully hidden:** the dragged piece turns slightly translucent while over the board
3. [x] **Invalid drop:** short "nope" wobble + soft thud before flying back
4. [x] **Reward ladder:** one tier function (1 line < 2 lines < combo ×3 < 4+ lines < board clear) drives sparkles, flash, sound layers and toast size; 40 ms hit-stop before the pops; warm board-edge glow while a combo is alive
5. [x] **New best mid-game:** the moment the score passes the old best, a crown flies to the score with a chime (once per game)
6. [x] **Audio mix:** master limiter (no clipping on big clears), ±5% pitch/volume variation, richer wood knock
7. [x] **Placed blocks settle:** tiny rotation wobble on top of the squash
8. [x] **App icon (1024) + launch screen** rendered from the real scene; launch background matches the first frame
9. [x] **Localization:** English + Swedish, all strings in one file, follows the device language
- Needs you / assets / devices: scanned wood textures, recorded foley, tuning lift/finger offset on real phones, frame-time on a 3-year-old iPhone.

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
