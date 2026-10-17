# IDEAS.md (parked — do not build until promoted to TASK.md)

- Daily puzzle with a fixed seed and shareable result
- Wood themes: oak, walnut, cherry, ebony, birch, driftwood (cosmetic unlocks / IAP)
- Adventure mode: fill-the-shape levels like the "Block Crush Wood Puzzle" ad
- Bomb / frozen blocks for a hard mode
- Hold slot (swap one piece)
- Weekly Game Center tournaments

## Wood workshop: small wood-themed games (requested Oct 12 2026, not promoted yet)
Same table, wood textures, sounds and haptics; one tile on Home ("Workshop"), each game ~2–5 min, offline, no timers by default.
- **Wood chess**: BUILT on branch `workshop-klotski` (15 opponents up to a ~depth-11 alpha-beta engine in a Web Worker, burned-in symbols on discs, promotion picker). Plus a Chess school (15 lessons, 37 engine-checked steps: piece moves → mate with king + rook) and a coach in games (mistake/blunder with the reason, Take back that lights the better move, pieces in danger ringed). Plus Daily training in the school: spaced repetition (FSRS-style memory model) over 1,322 Lichess puzzles (CC0) rated 500–2700, 9 opening lines for White, your own coached mistakes and finished lesson steps; interleaved themes, puzzles picked just above your rating, combo/rank-up celebrations. Plus a game review (accuracy per side, grades, step through with arrows and notation, mistakes into training), an evaluation bar, coordinates, captured-piece rows, opening names (52), resume, teach mode (best move and its idea every turn) and a from-above view (default; angled view in the level list). Plus play as White / Black / random (board turned round) and a move list under the bar (tap a move in the review to jump there). Still open: more opening lines (Black repertoire needs playing as Black); endgame drills (Lucena, Philidor) once the engine judges them reliably
- **Checkers (Dam)**: BUILT on branch `workshop-klotski` (15 computer opponents, depth 1 → 9; the computer thinks in a Web Worker; undo/hint cap stars at two)
- **Plank fit (tangram-style)**: BUILT on branch `workshop-klotski` (40 generated levels, tap to turn, hints cost stars)
- **Wooden sliding puzzle (Klotski)**: BUILT on branch `workshop-klotski` (30 levels, stars vs. solver par, `npm run workshop`)
- **Jenga-style stack**: pull blocks without toppling (needs physics; biggest scope)
- **Mahjong-style matching** with carved wood tiles
Order to build if promoted: Klotski → Tangram → Checkers → Chess (each reuses more of the current engine first).
