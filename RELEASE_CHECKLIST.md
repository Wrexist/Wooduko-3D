# Release checklist — Grain

Everything between the current prototype and a release-ready game, ordered by the 12-phase ladder.
One phase active at a time. Feel/visual polish lives in `POLISH.md` (mostly phase 6).

Legend: **[must]** blocks release · **[should]** strongly expected by players · **[nice]** can ship without

---

## Phase 1 — Codebase / feature completion
- [x] **[must]** Split `src/game.js` into modules (board logic / render / fx / audio / input / ui / config)
- [x] **[must]** Convert to TypeScript (strict), add `npm run typecheck`
- [x] **[must]** Pure, tested board logic: placement, clear detection (rows/cols/boxes), scoring, combo rules, game-over check
- [x] **[must]** One `config` object for every tunable (heights, camera tilt, lift, timings, scoring, colours)
- [x] **[must]** Home screen: Play, Continue, Settings, best score
- [x] **[must]** Pause menu (resume, restart, settings, home)
- [x] **[must]** Settings: sound, music, haptics, reduce motion, reset progress (with confirm)
- [x] **[must]** First-time tutorial: 2–3 guided placements with a pointing hand, skippable
- [x] **[must]** Game-over screen v2: score, best, "new best" celebration, play again, (later) revive _(revive comes with ads)_
- [ ] **[should]** Stats screen: games played, best, average, lines cleared, best combo
- [ ] **[should]** Music: 2–3 calm loops, separate volume from sound effects _(one quiet generative WebAudio loop with its own toggle for now)_
- [x] **[should]** Self-host fonts (Fraunces, DM Sans) so the app works fully offline
- [ ] **[nice]** Undo last move (limited uses — could be a rewarded-ad reward)

## Phase 2 — Bug hunt / hardening
- [ ] **[must]** Resize / rotate mid-drag doesn't break the piece or the preview
- [x] **[must]** Second finger touching the screen mid-drag is ignored (multi-touch)
- [ ] **[must]** App backgrounded mid-animation: state saved, no half-placed pieces on return
- [x] **[must]** Save file versioning + migration; corrupted save falls back to a new game instead of a blank board
- [ ] **[must]** Verify tray pieces never render off-screen on narrow phones (iPhone SE) and wide iPads
- [ ] **[must]** Memory: play 30+ minutes, confirm geometry/material counts stay flat (`renderer.info`)
- [ ] **[must]** Game-over check covers every tray piece, including after loading a save
- [x] **[should]** Restart button: replace the "tap twice" toast with a real confirm dialog
- [ ] **[should]** Error tracking (Sentry) wired before TestFlight

## Phase 3 — Core gameplay & design
- [ ] **[must]** Piece generator fairness: guarantee at least one placeable piece per tray, tune the weights, avoid long droughts of small pieces
- [ ] **[must]** Decide combo rule (current: resets on any non-clearing move; Woodoku-style allows a short grace) and document it
- [ ] **[must]** Playtest 10+ people unseen; record where they hesitate or misplace
- [ ] **[should]** Difficulty curve: piece mix gets slightly harder as the score climbs
- [ ] **[should]** "Almost there" hint: subtle highlight of a row/column that needs one more cell (optional setting)
- [ ] **[nice]** Second mode (Daily puzzle) only after Classic is release quality

## Phase 4 — Economy / progression / balance
- [ ] **[must]** Final scoring table (placement, per-line, multi-clear, combo multiplier, board-clear bonus) and check scores stay meaningful into the thousands
- [ ] **[should]** Progression hooks: achievements (first combo ×3, 4-line clear, board clear, 1 000/5 000/10 000 points)
- [ ] **[should]** Unlockable wood themes tied to milestones (cosmetic only)
- [ ] **[nice]** Daily streak reward

## Phase 5 — Retention & live ops
- [ ] **[should]** Game Center: leaderboard (best score) + achievements
- [ ] **[should]** Local notifications (opt-in, after a few sessions): daily puzzle / streak reminder
- [ ] **[should]** Review prompt after a strong moment (new best or board clear), never after a loss
- [ ] **[nice]** Remote config for piece weights and ad frequency so balance can change without a release

## Phase 6 — UI / UX / animation
- [ ] **[must]** Everything in `POLISH.md` marked [must]
- [ ] **[must]** App icon (1024×1024) and launch screen that matches the first frame (no white flash)
- [ ] **[must]** Safe areas on every iPhone shape (notch, Dynamic Island, home indicator) and iPad
- [ ] **[should]** Localization: English + Swedish at minimum; all strings in one file
- [ ] **[should]** Accessibility: VoiceOver labels on buttons, Dynamic Type for menus, colour-safe highlights

## Phase 7 — Performance / mobile optimization
- [ ] **[must]** Capacitor iOS project: bundle id `com.wrexist.grain`, `contentInset: never`, status bar style
- [ ] **[must]** `CADisableMinimumFrameDurationOnPhone = true` in Info.plist for 120 Hz on ProMotion iPhones
- [ ] **[must]** Haptics through `@capacitor/haptics` (light on place, medium on clear, success on board clear)
- [ ] **[must]** Saves through `@capacitor/preferences` (iOS may clear WebView localStorage)
- [ ] **[must]** Audio: unlock on first touch, respect the silent switch, pause music when backgrounded
- [ ] **[must]** Hold 60 fps on an iPhone XR / 11 and 120 fps on a 13 Pro or newer; profile shadow map size and pixel ratio
- [ ] **[must]** Cold start under 2 s; first frame shows the board, not a blank screen
- [ ] **[should]** Lazy-create FX resources; pool chips/sparkles (sparkles already pooled)
- [ ] **[should]** Android build tested on a mid-range device (if shipping Android)

## Phase 8 — Monetization
- [ ] **[must]** Decide the model. Suggested: free + ads, with a one-time "Remove ads" IAP
- [ ] **[must]** ATT prompt **before** initializing any ad/attribution SDK
- [ ] **[must]** AdMob (or AppLovin MAX): rewarded "Revive" (clear a 3×3 area or swap tray) and capped interstitials (never mid-game, never in the first sessions)
- [ ] **[must]** RevenueCat: Remove ads product, entitlement, Restore Purchases button in Settings
- [ ] **[should]** Theme packs as IAP (cosmetic)
- [ ] **[must]** Privacy manifest (`PrivacyInfo.xcprivacy`) covering every SDK

## Phase 9 — Analytics / A/B testing
- [ ] **[must]** Mixpanel events: app_open, game_start, piece_placed (sampled), line_clear, combo, game_over (score, duration), revive_offered/used, ad_shown, purchase
- [ ] **[should]** Funnels: tutorial completion, D1/D7 retention, games per session
- [ ] **[nice]** A/B test: camera tilt, combo rule, interstitial frequency

## Phase 10 — ASO / App Store listing
- [ ] **[must]** Name + subtitle + keywords (e.g. "Grain: Wood Block Puzzle")
- [ ] **[must]** Screenshots for 6.9" and 6.5" iPhone + 13" iPad, showing the 3D blocks and a big clear moment
- [ ] **[must]** App preview video (15–30 s) of satisfying clears
- [ ] **[must]** Description, promo text, privacy policy URL, support URL, age rating, review notes
- [ ] **[should]** Localized listing (English, Swedish)

## Phase 11 — Release candidate / zero-defect audit
- [ ] **[must]** Full test pass on iPhone SE, standard iPhone, Pro Max, iPad (portrait + landscape)
- [ ] **[must]** Test fresh install, update over an old save, airplane mode, low-power mode
- [ ] **[must]** Test purchases + restore in sandbox; ads with test IDs, then real IDs
- [ ] **[must]** TestFlight with 10–20 external testers for at least a week
- [ ] **[must]** No console errors, no placeholder text, version/build numbers set

## Phase 12 — Post-launch live ops
- [ ] Watch crash-free rate, D1/D7 retention, ad revenue per user
- [ ] First update within 2 weeks: fixes + one new theme
- [ ] Daily puzzle mode as the first content update
