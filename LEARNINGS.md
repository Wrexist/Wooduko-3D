# LEARNINGS.md

- Dragged pieces must hover on the camera's line of sight above their landing spot, with a near-overhead light, otherwise the piece, its shadow and the drop spot disagree and players get confused.
- A recess as deep as the block height (blocks flush with the table) reads far better than shallow cells.
- Highlights need to fade/pulse, not snap on/off; snapping needs hysteresis (~0.7 cell) to stop flicker.
- A procedural wood texture must be tileable (integer sine frequencies over the width) or a seam shows down the table.
- Headless Chromium + SwiftShader runs at a few fps: screenshot timing there is not real timing.
- TypeScript 7 (native port) is npm `latest` but typescript-eslint only supports `<6.1`. Pinned TS 6.0.3.
- Playwright needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL screenshots headless (see `scripts/shot.mjs`).
- Three r186: `PCFSoftShadowMap` is gone (falls back to PCF with a warning). PCF now blurs with per-pixel noise using `shadow.radius`; radius 1 gives dashed edges under the ridges, 3 looks soft.
- Three r152+ colour management: hex colours are treated as sRGB and converted to linear. The r128 prototype treated them as linear. `linearColor()` (`render/color.ts`) keeps the old look for material tints; signal colours (clear glow, gold ghost) use true sRGB so they read clearly over light maple.
- Light intensities: legacy r128 numbers × π are a good starting point for physical units.
- Canvas textures upload (and count in `renderer.info`) on first render, so a once-per-game effect looks like a leak in a soak. Pre-warm it instead: that also removes the first-use hitch.
- Pointer drag: never clear the drag state before the final fit check on release (it made every drop fly back).
- Tutorial boards must leave other blocks on the board, otherwise every lesson ends in "Board clear!" (+150).
- Dialogs stacked over menus need solid cards; translucent cards let the menu text bleed through.
- Art recipes (synth voices in `audio/sound.ts`, brush strokes in `render/textures.ts`) stay inline: they get replaced by recorded foley and scanned textures in phase 6. Everything gameplay, feel, layout and timing is in `config.ts`.
- A drop animation that finishes during a reset (restart, tutorial step) used to commit into the *new* game. Delayed callbacks now carry a board generation, and commits check the tray piece is still current. The flow test fails without the guard.
- Backgrounding should finish all tweens, not just pause: a piece mid-drop then commits and saves before iOS can kill the app.
- WebGL context loss: Three r186 re-initialises on `webglcontextrestored` and re-uploads canvas textures by itself; nothing extra was needed (verified with `WEBGL_lose_context`).
- 320 px wide: a 5-digit Fraunces score at 48 px pushes the HUD grid wider than the screen. Use `minmax(0, 1fr)` for the middle column and clamp font sizes to `vw`.
- Overlays: `display: flex` + `overflow-y: auto` + `margin: auto` on the card centres when it fits and scrolls from the top when it doesn't (`place-items: center` cuts off the top instead). Needs `touch-action: pan-y` because the body disables touch scrolling.
- Never run a long soak against the dev server: editing a .ts file reloads the page. Use the test build.
- Never stop the dev server with `taskkill /IM node.exe`: it kills every Node process on the machine. Stop the specific PID.
- Wood themes redraw the existing canvas textures in place (`Textures.setTheme`) and flag `needsUpdate`: no new GPU objects, no material rewiring, nothing to dispose.
- Dark woods need a light board (ebony): block/board contrast matters more than "realistic" pairings. Ridges need a per-theme tint or they stay orange on grey woods.
- A CSS edit that inserts a comment must not land inside a selector list: `.a /* x */ .card` silently became a descendant selector and un-centred every menu card. The layout check now also catches stretched cards.
- Game Center on Capacitor 8: only single-maintainer forks exist on npm; a ~100-line in-repo Swift plugin is safer than a supply-chain dependency.
- Headless Chromium inherits the machine's locale (Swedish here): test scripts pin `locale: 'en-US'` so role/name lookups stay stable.
- DOM that is rebuilt per event (toast subtitle, banner) makes soak DOM counts wobble; build once and swap text.
- A one-off thin vertical line across a block top showed up in one close-up and never again in identical re-renders; watch for it on device.
- `[hidden]` loses to any component rule that sets `display` (e.g. `.setting { display: flex }`): a global `[hidden] { display: none !important }` is needed.
- `xcode`'s `addResourceFile` requires a group literally named "Resources"; Capacitor projects don't have one, so add the file reference + build-phase entries by hand.
- Never edit a file by slicing between two search anchors after Prettier ran: a reformatted anchor silently truncates the file. Use exact-match replacements that fail loudly.
- An independent review pass (fresh agent, read-only) before release found 11 real issues the tests missed — mostly ordering/race bugs around ads, sessions and the tutorial. Worth repeating before each release.
- Sessions that only count cold starts are wrong on iOS: apps live in memory for days. Count a return after 30 minutes as a session and re-schedule time-based things (reminders) on foreground.

## Playtests

### Bot playtest — Phase 3 (2026-10-05, `npm run sim`, 240 casual + 60 skilled games per config)
| | casual: median moves / score | casual: clears at combo ≥2 | skilled: median moves / score | longest run without a small piece |
|---|---|---|---|---|
| prototype generator, strict combo | 64 / 664 | 22.7% | 1850 / 22.6k | 17–20 |
| new generator, strict combo | 76 / 813 | 23.4% | 1418 / 17.9k | 8 |
| **new generator, grace 1 (shipped)** | 77 / 915 | 45.5% | 1100 / 16.5k | 8 |
| new generator, grace 2 | 74 / 1117 | 70.5% | 1478 / 35.9k | 8 |

- The fairer generator helps beginners (casual games +19% longer) and the ramp shortens marathon games (skilled −23% moves). That is the intended shape: easy start, rising pressure.
- Dead trays (nothing fits) never showed up in bot games even with the prototype generator, but a unit test finds them on near-full boards; the forced fit removes them entirely.
- Combo rule: **grace 1** (a streak survives one miss). It doubles how often a casual player sees "Combo" for ~13% higher median scores. Grace 2 makes combos the default and doubles skilled scores, so a combo stops feeling special. The pill dims and pulses while a streak is at risk.
- The skilled bot still hits the 2,500-move cap in ~20% of games: a perfect player can play nearly forever. Fine for a calm game; revisit with real players before making the ramp steeper.
- Bots are not people: use these numbers to compare before/after, not as absolute difficulty. Human playtest script: `PLAYTEST.md`.

- **Carving a table hole from a 2D shape (Workshop):** `ExtrudeGeometry` + `rotateX(+π/2)` maps shape *y* to world *+z* (not −z). The first Klotski tray had its exit notch on the wrong edge because of a sign flip. Also: an extruded hole is narrowed by `bevelSize` on each side, so outset the hole by the bevel (as `table.ts` does).

- **120 Hz is not available to us on iPhone (Oct 2026):** WKWebView caps `requestAnimationFrame` at 60 fps on ProMotion screens even with `CADisableMinimumFrameDurationOnPhone` set (WebKit bug 294338; the "near 60fps" flag only affects Safari). Aim for a steady 60 instead; motion is dt-based, so it will feel right at 120 the day WebKit allows it. Pixel ratio is capped at 3 with the adaptive step-down in `renderer.ts`.

- **Checkers AI belongs in a Web Worker:** a depth-9 alpha-beta search takes up to ~1.6 s on a desktop (more on a phone), which freezes the frame loop on the main thread. The opponent runs in `src/workshop/checkersWorker.ts` (Vite `new Worker(new URL(..., import.meta.url), { type: 'module' })`); if the worker can't start or dies, the controller answers on the main thread. Never import the worker file from the main thread (its `self.onmessage = …` would take over `window.onmessage`): shared code lives in `checkersAsk.ts`.

- **Flat markers need `toneMapped: false`:** translucent amber markers drawn through the tone mapper came out pale cream and vanished against light wood. Marker materials skip tone mapping, and the dark squares are deep walnut so amber reads on them.

- **Chess engine: a clock-stopped search is mid-line:** the engine aborts by throwing when its time runs out, which leaves moves made on the board. `think`/`scoreAll` unwind the move stack back to where they started (`unwind`); without it the next legal-move list came from a corrupted position. Rules are pinned by perft tests (start, Kiwipete, positions 3–5).

- **Lit dark ink washes out:** the scene's key light is bright enough that a dark-brown `MeshStandardMaterial` symbol rendered as caramel. Burned-in chess symbols use unlit `MeshBasicMaterial`.

- **Lesson positions must be checked by the engine, not by eye:** of the first lesson drafts, four were wrong. Winning the queen with a lone knight or bishop is a draw (insufficient material), so the engine scored it 0. And a "mate in two" had a mate in one. `tests/chessSchool.test.ts` runs every step through the engine (mate distance for mates, material for tactics, a breadth-first par for "take every piece").

