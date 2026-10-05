# Polish backlog — Grain

Everything that makes it feel premium. Mostly phase 6, some phase 7.
**[must]** before release · **[should]** noticeably better · **[nice]** extra delight

## Visuals — wood & lighting
- [ ] **[must]** Swap procedural textures for real photo-scanned wood (top end-grain, side long-grain, table, board) with normal + roughness maps
- [x] **[must]** Contact shadows / baked ambient occlusion where blocks meet the board floor and ridges
- [x] **[should]** Slight colour variation per block (several wood tones, not just brightness)
- [ ] **[should]** Subtle environment reflection for a satin lacquer sheen on block tops
- [ ] **[should]** Board edge: real routed profile (chamfer + inner lip) instead of a straight cut
- [ ] **[nice]** Soft depth-of-field / vignette on the table edges
- [ ] **[nice]** Seasonal table themes (dark walnut, light birch, marble inlay)

## Motion & feel
- [ ] **[must]** Tune hover height, finger offset and follow speed on real phones (current: 0.7 lift, 1.8 cells above finger)
- [x] **[must]** Dragged piece never hides the ghost completely: try a slight scale-up and translucent edge while dragging
- [x] **[must]** Invalid drop: short "nope" wobble + soft thud before flying back to the tray
- [x] **[should]** Placed blocks settle with a tiny rotation wobble, not just a squash
- [x] **[should]** Clear animation timing pass: lines pop in a wave from the drop point (exists), add a 30–50 ms hit-stop before the pop
- [ ] **[should]** Tray refill: pieces slide in on a short arc with a soft shadow trail
- [ ] **[should]** Score counter: digit roll instead of a number blur on big gains
- [ ] **[nice]** Idle: very gentle light shift over time so the table feels alive

## Rewards ("dopamine")
- [x] **[must]** Escalating feedback ladder: 1 line < 2 lines < combo ×3 < 4+ lines < board clear, each step visibly and audibly bigger
- [x] **[must]** "New best score" moment mid-game (crown flies to the score), not only at game over
- [x] **[should]** Combo streak builds a visible warm glow around the board edge
- [x] **[should]** Word callouts styled per tier (Great / Excellent / Unreal / Board clear) with matching sounds
- [ ] **[nice]** Rare "perfect fit" bonus when a piece fills a hole exactly

## Audio
- [ ] **[must]** Replace synthesized sounds with recorded wood foley: pickup, slide, place (2–3 variations), clear, combo chimes
- [x] **[must]** Mix pass: no clipping when many sounds overlap; master limiter
- [x] **[should]** Pitch/volume randomization ±5 % so repeats don't sound robotic
- [ ] **[should]** Music: calm lo-fi / acoustic loops that duck slightly on big clears

## Haptics (native)
- [ ] **[must]** Light tick on pickup, soft impact on place, sharp double tap on clear, success pattern on board clear
- [ ] **[should]** Selection tick when the ghost snaps to a new cell

## UI
- [x] **[must]** Consistent icon set and button style across HUD, menus and dialogs
- [x] **[must]** Replace the "Restart?" toast with a proper dialog
- [x] **[should]** Menu transitions (fade + slight scale), no hard cuts
- [ ] **[should]** Toasts never cover the piece you're about to place
- [ ] **[nice]** Board-shaped loading reveal on cold start

## Performance feel
- [ ] **[must]** Zero dropped frames during the biggest clear (4 lines + board clear) on a 3-year-old iPhone
- [ ] **[must]** Input latency: piece follows the finger the same frame (check WKWebView touch handling)
- [x] **[should]** Pre-warm shaders on the loading screen so the first clear doesn't hitch
