# Playtest script — Grain

Goal: watch 10+ people play who have never seen the game. Bots tell us about balance; only people
show where the game is confusing. About 15 minutes per person.

## Before
1. Run `npm run dev`, open the URL on the phone (same Wi-Fi). Use a phone, not a laptop.
2. Clear the game first so they get the tutorial: open the page, then in the browser menu use
   "Clear site data" (or test in a private tab).
3. Sound on. Don't explain anything. Say only: "It's a wood block puzzle. Think out loud."

## Watch for (tick or note the moment)
| # | Question | Notes |
|---|---|---|
| 1 | Did they finish the tutorial without help? Where did they hesitate? | |
| 2 | Did they understand that 3×3 squares clear (not just rows/columns)? | |
| 3 | Did a drop ever land somewhere they didn't expect? (watch the finger vs. the piece) | |
| 4 | Did they notice the gold preview before dropping? | |
| 5 | Did they notice the "Combo ×N" pill? Did they notice it dim after a miss? | |
| 6 | Did they understand why a tray piece was grey? | |
| 7 | Did they ever wait for new pieces, unsure what to do? | |
| 8 | Did a clear feel rewarding? Which one got a reaction? | |
| 9 | Did they find pause / restart / sound without help? | |
| 10 | Game over: did it feel fair or "the game cheated me"? | |

## After (ask, don't lead)
- "What was the most satisfying moment?"
- "Was anything annoying?"
- "Would you play again tomorrow? Why / why not?"
- Score reached, and roughly how many minutes the first game lasted.

## Afterwards
Add one line per person to `LEARNINGS.md` under "Playtests": what confused them and their score.
Patterns that show up 3+ times become tasks.
