# Backend: Supabase

## Why Supabase over Firebase

Both fit the requirements (silent per-player accounts + score storage). Supabase wins for this app because:

1. **Pure-JS client** — `@supabase/supabase-js` has no native module, so it runs in Expo Go, EAS builds, and web with zero config. Firebase's fully-featured RN path (`@react-native-firebase/*`) needs native config files per platform and a dev build even to iterate.
2. **Anonymous sign-ins built in** — the app's no-registration design (owner decision 2026-08-15: player name only, store account as identity) maps directly onto Supabase anonymous auth plus one `claim_username` RPC.
3. **Postgres + RLS** — the scores table is one table with two policies; the "never lower a best score" rule is a 5-line SQL function instead of client logic or Cloud Functions.
4. **Store-required account deletion** — one `SECURITY DEFINER` RPC deletes auth user + data in a single transaction. Firebase needs a Cloud Function (paid tier for outbound calls) or client-side re-auth juggling.
5. **Privacy posture** — single-region Postgres you control fits "we store only a player name + scores, nothing else" cleanly; no cross-product analytics defaults to disable.

Costs are comparable at this scale (free tier covers launch; scores are tiny rows).

## Project setup

1. Create a project at [supabase.com](https://supabase.com) (Golden Age Games org).
2. Run `supabase/schema.sql` in the SQL editor.
3. **Auth → Providers**: enable **"Allow anonymous sign-ins"**. Email provider can stay disabled — the app never registers emails.
4. ~~Email templates~~ — not needed anymore. (Historical note: the original brief specified email registration with a confirmation email; the owner replaced that with the no-registration design below.)

### Identity design (owner decision, 2026-08-15)

- First launch: the app silently calls `signInAnonymously()`, then asks the player to pick a unique **player name** (`claim_username` RPC, 3–16 chars).
- The **store account is the identity**: in dev/store builds the app authenticates with **Game Center** (iOS, via the `expo-game-center` module) / **Play Games Services v2** (Android) and links `profiles.platform_player_id`, so a reinstall or new phone finds the same profile with zero sign-in. Expo Go can't load those native modules, so in development this link is skipped (see `src/services/identity.ts`).
- Purchases already follow the store account via RevenueCat + Restore Purchases, independent of all of this.

<details><summary>Original email template (superseded)</summary>

   > **Subject:** Welcome to Retro Arcade 🕹️
   >
   > **Body (HTML):**
   > ```html
   > <h2>You have successfully registered — you can enjoy a nostalgic experience with Retro Arcade</h2>
   > <p><a href="{{ .ConfirmationURL }}">Tap here to confirm your email and start playing</a></p>
   > <p>— Golden Age Games</p>
   > ```

</details>
5. Copy the project URL + anon key into `.env` (see `.env.example`).

The anon key ships in the client by design; every data path is guarded by RLS.

## RevenueCat setup

**Status: mostly configured (2026-08-13, via RevenueCat API).** What exists in the dashboard:

| Item | Value |
|---|---|
| Project | **Retro Arcade** (`projbceac287`) |
| iOS app | `app0f1a18c13d`, bundle `com.goldenagegames.retroarcade` |
| Android app | `appd76eb1bfde`, package `com.goldenagegames.retroarcade` |
| Products | `retro_arcade_full` non-consumable, registered on both apps (`prod0ea8496783` iOS, `prod842ed1f3c3` Android) |
| Offering | `default` ("Full Arcade", current) with package `$rc_lifetime` containing both products |
| iOS public SDK key | `appl_OdsWeaTwVSLSGaMKwdIjOFknCZO` → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` |
| Android public SDK key | `goog_FMEubgkLBBlHTYFkzapOGzSsdgw` → `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` |

(These SDK keys are RevenueCat *public* app keys — designed to ship inside the client binary; access control lives server-side.)

**Remaining dashboard steps (blocked from the API by key scopes / store accounts):**

1. **Create the entitlement** `full_arcade` (display name "Full Arcade — all games forever") and attach both `retro_arcade_full` products to it — Project Settings → Entitlements. The API key connected to this workspace lacks `project_configuration:entitlements:read_write`, so this must be done in the dashboard (or widen the key's scopes and ask Claude to finish it).
2. **Create the store products**: `retro_arcade_full` non-consumable at **$4.99** in App Store Connect and Play Console once the developer accounts exist. Use each store's regional price tiers (India/Egypt/Brazil etc.) — do not hand-set one global price.
3. **Connect store credentials** in RevenueCat (App Store Connect API key, Play service account) so receipts validate.

The app identifies the RevenueCat user with the Supabase user id, so entitlements follow the account across devices, and `restorePurchases` covers store-account reinstalls. Without keys (or in Expo Go) the app uses a **mock store** so the lock/unlock flow stays fully testable in development.
