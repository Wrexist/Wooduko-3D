# TASK.md

## Active phase
**Phase 1 — Rebuild & feature completion** (spec: `MASTER_PROMPT.md`)

## Plan

### Step 1 — Scaffold (tooling only, no game code)
- [x] Unpack `grain-repo.zip` into the repo root, delete the zip
- [x] TypeScript strict `tsconfig.json` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [x] Vitest (`npm test`), ESLint flat config + typescript-eslint, Prettier
- [x] Scripts: `dev`, `build`, `typecheck`, `test`, `lint`, `format`
- [x] Empty module folders from the architecture (`core/ state/ render/ fx/ input/ audio/ platform/ ui/`) with `config.ts` + `core/types.ts` stubs
- [x] Legacy game keeps running: move `src/game.js` + `three-global.js` to `legacy/`, `index.html` still boots it until step 3 replaces it
- [x] Update `CLAUDE.md`: Three.js r128 pin is lifted (master prompt wins), new layout

### Step 2 — `core/` port + tests (pure, no DOM/Three)
- `types.ts`, `shapes.ts` (rotations/mirrors, dedupe, weight split), `board.ts` (canPlace, place, findClears, applyClear, components), `scoring.ts`, `generator.ts` (seeded RNG, weighted tray, 40 retries), `rules.ts` (game over, streak), `save.ts` (versioned, validated)
- Tests: orientation counts per base shape, canPlace edges, clears row/col/box/combined, scoring table, component split keeps seed + UV centre, game-over, save round-trip + corrupt inputs
- `state/store.ts` (Zustand vanilla) on top of core

### Step 3 — Render / input / FX / audio / HUD rebuild
- Three.js latest (pinned exact), SRGB colour space, physical light units retuned, ACES
- Order: renderer+camera fit → textures+table → block geometry → blocks+tray → drag+ghost+preview → tween+FX → audio → HUD/toast/float text → game over
- Screenshots (390×844, 1280×800): empty board, drag with ghost + preview, mid multi-clear; compare to `prototype/grain.html`
- Self-host Fraunces + DM Sans in `public/fonts/` (zero network)
- Delete `legacy/` when the new build is at parity

### Step 4 — Menus & tutorial
- Home (Play / Continue / Settings / best), pause menu, settings (sound, music, haptics, reduce motion, reset progress), restart confirm dialog, 3-step skippable tutorial with pointing hand

### Accept when
- Every rule in master prompt §4 unit-tested and green
- Full game playable portrait + landscape, no console errors, screenshots reviewed

## Risks
- **Three r128 → latest:** light intensities, colour space, `ExtrudeGeometry` UV groups all changed. Retune by screenshot, not by copying numbers.
- **TypeScript 7 (native Go port) is the npm `latest`:** typescript-eslint may not support it yet. Pin TS 5.9.x if peer deps complain.
- **Vite 8 / Vitest 5:** new majors; pin exact versions that install cleanly together.
- **Headless WebGL is slow (SwiftShader):** screenshots for looks only, never for timing.
- **Feel parity is subjective:** keep the prototype open side by side; port its exact constants into `config.ts` first, tune second.

## Done
- [x] Playable prototype: 3D carved blocks, ghost preview, clear FX, combos, save/resume (v0.1.0)
