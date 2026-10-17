# IDEAS.md (parked — do not build until promoted to TASK.md)

- Daily puzzle with a fixed seed and shareable result
- Wood themes: oak, walnut, cherry, ebony, birch, driftwood (cosmetic unlocks / IAP)
- Adventure mode: fill-the-shape levels like the "Block Crush Wood Puzzle" ad
- Bomb / frozen blocks for a hard mode
- Hold slot (swap one piece)
- Weekly Game Center tournaments

## Wood workshop: small wood-themed games (requested Oct 12 2026, not promoted yet)
Same table, wood textures, sounds and haptics; one tile on Home ("Workshop"), each game ~2–5 min, offline, no timers by default.
- **Wood chess**: BUILT on branch `workshop-klotski` (15 opponents up to a ~depth-11 alpha-beta engine in a Web Worker, burned-in symbols on discs, promotion picker). Still open: daily chess puzzle (mate in 2)
- **Checkers (Dam)**: BUILT on branch `workshop-klotski` (15 computer opponents, depth 1 → 9; the computer thinks in a Web Worker; undo/hint cap stars at two)
- **Plank fit (tangram-style)**: BUILT on branch `workshop-klotski` (40 generated levels, tap to turn, hints cost stars)
- **Wooden sliding puzzle (Klotski)**: BUILT on branch `workshop-klotski` (30 levels, stars vs. solver par, `npm run workshop`)
- **Jenga-style stack**: pull blocks without toppling (needs physics; biggest scope)
- **Mahjong-style matching** with carved wood tiles
Order to build if promoted: Klotski → Tangram → Checkers → Chess (each reuses more of the current engine first).
