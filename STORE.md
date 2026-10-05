# Store setup — Grain (things only you can do)

Everything in code is done; these steps need your accounts. Do them once, in this order.

## 1. Apple Developer / App Store Connect
1. Create the app: bundle id **`com.wrexist.grain`**, name **Grain: Wood Block Puzzle**, primary language English, add Swedish.
2. Capabilities (Certificates, IDs & Profiles → Identifiers → `com.wrexist.grain`): enable **Game Center** and **In-App Purchase**.
3. Game Center (App Store Connect → your app → Services → Game Center):
   - Leaderboard **`grain.best`** — Classic, "High score is best", integer.
   - 11 achievements, ids and texts in `DESIGN.md` (titles/descriptions in `src/i18n.ts`, en + sv).
4. In-App Purchase: **Non-Consumable**, product id **`grain_remove_ads`**, reference name "Remove ads". Suggested price tier: $2.99. Add en + sv display name and description.
5. Agreements, tax and banking must be active before purchases work (also in TestFlight sandbox).

## 2. RevenueCat (Remove ads)
1. New project → iOS app with bundle id `com.wrexist.grain` → connect App Store Connect (in-app purchase key).
2. Product `grain_remove_ads` → entitlement **`no_ads`** → put it in the **current offering**.
3. Copy the **public iOS SDK key** (`appl_…`) into `PURCHASES.revenueCatKey` in `src/config.ts`.
   (Empty key = the Remove ads button stays hidden.)

## 3. Google AdMob
1. Add an iOS app (link it to the App Store listing once it exists).
2. Create two ad units: **Rewarded** ("Revive") and **Interstitial** ("Between games").
3. Privacy & messaging → create a **GDPR (European regulations) message** and an **IDFA explainer** message. Publish both. The game shows them through Google's consent SDK before any ad loads.
4. In `src/config.ts` → `ADS`: put your **app id** (`ca-app-pub-…~…`), **rewarded id** and **interstitial id**, and set **`testMode: false`**.
5. Run `npm run ios:sync` (it writes the app id into Info.plist).
6. Check `native/ios/skadnetwork.txt` against Google's current list (link in the file).
7. Add an `app-ads.txt` on your developer website (AdMob shows the exact line).

Until step 4, the app shows **Google test ads** — safe to run on devices; real ids on your own phone can get your AdMob account flagged.

## 4. App Store privacy label ("App Privacy")
With AdMob + RevenueCat, answer **Yes, we collect data**:

| Data type | Linked to user? | Tracking? | Purpose |
|---|---|---|---|
| Identifiers → Device ID (IDFA, only if the player allows tracking) | No | **Yes** | Third-party advertising |
| Usage Data → Advertising Data | No | **Yes** | Third-party advertising |
| Usage Data → Product Interaction | No | No | Third-party advertising, analytics (ad SDK) |
| Diagnostics → Crash Data, Performance Data | No | No | App functionality (ad SDK) |
| Location → Coarse Location (from IP, by the ad SDK) | No | Yes | Third-party advertising |
| Purchases → Purchase History | No | No | App functionality (RevenueCat restores Remove ads) |

Grain itself stores the save, best score, settings, stats and awards **only on the device**. No account, no analytics.
Re-check against Google's "AdMob data disclosure" page and RevenueCat's privacy docs when you fill it in.

## 5. Age rating
No objectionable content. Ads are present, no unrestricted web access, no gambling. Expected: **4+**.
Set "Made for Kids" to **No** (the ad setup is not designed for children's apps).

## 6. Privacy policy + support URL
App Store requires both. `PRIVACY.md` is a ready draft (en + sv); publish it somewhere public
(e.g. GitHub Pages) and use that URL. Support URL can be the same site with a contact email.
