# Grain — game design reference

The rules as shipped. Every number lives in `src/config.ts`; this page explains them.

## Scoring (final, Phase 4)
| Event | Points |
|---|---|
| Place a piece | +1 per cell (1–5) |
| Clear `u` units at once (rows + columns + 3×3 boxes) | `18·u + 9·u·(u−1)` → 1: 18, 2: 54, 3: 108, 4: 180, 5: 270 |
| Combo multiplier | `× (1 + 0.5·(streak − 1))` → ×1, ×1.5, ×2, ×2.5 … |
| Board clear (board empty after a clear) | +150 |

Multi-line clears grow faster than linear, so setting up a double or triple pays more than clearing
lines one at a time. The combo multiplier rewards rhythm on top of that.

**Does it stay meaningful into the thousands?** Bot playtest (`npm run sim`, Phase 3):
casual median ≈ 900, casual top 10% ≈ 2,100, skilled median ≈ 16,000. The score achievements sit on
that curve: 1,000 (a good casual game), 5,000 (a strong game), 10,000 (expert).

## Combo
The streak grows with every placement that clears. A placement that clears nothing is a *miss*: the
streak survives **one** miss (the pill dims and pulses: "clear on your next move") and resets on the
second. Chosen with the bot sim: it doubles how often casual players see a combo for ~13% higher
scores. Two free misses made combos the default and halved their value.

## Pieces
13 base shapes, all rotations and mirrors (39 orientations), weighted (small L most common, plus and U
rarest). Dealing a tray of 3:
1. **Ramp:** big pieces (5 cells) ×0.85 at score 0 → ×1.2 at 4,000; small pieces (≤3 cells) ×1.1 → ×0.92.
2. **Drought guard:** a small piece is forced into the tray once 7 pieces have gone by without one.
3. **Fit:** re-roll up to 40 times until a piece fits; then force a fitting piece. A tray where nothing
   fits is never dealt (game over only happens because of how you placed).

## Progression (local, Game Center in phase 5)
| Achievement | How | Unlocks wood |
|---|---|---|
| First cut | Clear your first line | |
| In the groove | Combo ×3 | |
| On a roll | Combo ×5 | Cherry |
| Triple cut | Clear 3 lines with one block | |
| Clean sweep | Clear 4+ lines with one block | |
| Spotless | Clear the whole board | Driftwood |
| Apprentice | 1,000 in one game | Walnut |
| Journeyman | 5,000 in one game | |
| Master carpenter | 10,000 in one game | Ebony |
| Regular | Finish 10 games | Birch |
| Sawdust | Clear 500 lines in total | |

Woods are cosmetic only. Stats: games, best, average, lines, best combo, board clears.
A restarted game with a score counts as played. The tutorial never counts.
