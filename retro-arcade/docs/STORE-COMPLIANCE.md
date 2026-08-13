# Store Compliance Checklist

Status legend: ✅ implemented in app · 🔧 dashboard/console task before submission

## Apple App Store

- ✅ **Restore purchases** button on the purchase screen (Guideline 3.1.1)
- ✅ **Account deletion** in Settings, deletes auth user + all data (5.1.1(v))
- ✅ **No mention of external payment** anywhere in UI or strings (3.1.1)
- ✅ No ads, no tracking → App Tracking Transparency prompt not needed
- 🔧 **Privacy policy URL** in App Store Connect (host a page stating: we collect email + password + game scores, nothing else; no ads; no data sale)
- 🔧 Privacy "nutrition label": Data linked to you → Email address, Gameplay content (scores). No tracking.
- 🔧 In-app purchase `retro_arcade_full` created, priced $4.99 tier with regional equivalents

## Google Play

- ✅ **Account deletion** in-app (User Data policy)
- 🔧 **Data safety form**: collects Email (account management), App activity → scores (app functionality); encrypted in transit; deletable via in-app deletion
- 🔧 Same privacy policy URL
- 🔧 In-app product `retro_arcade_full`, $4.99 with regional pricing
- 🔧 "Families" not targeted (broad audience app) — confirm content rating questionnaire

## Brand promises enforced in code

- One-time $4.99, non-consumable — `src/services/purchases.ts` has exactly one product
- **No ads ever** — no ad SDK in `package.json`; keep it that way in review
- Free demo: Snake + Memory Match (`free: true` in `src/games/registry.tsx`); full catalog visible with lock badges
- Buyers own all future games: entitlement `full_arcade` gates every non-free game, including ones added later

## Privacy statement (shown in Settings)

"We store only your email, your password (encrypted), and your game scores. Nothing else. We never show ads and never sell data."
