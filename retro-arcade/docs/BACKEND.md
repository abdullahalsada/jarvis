# Backend: Supabase

## Why Supabase over Firebase

Both fit the requirements (email/password auth + per-user score storage). Supabase wins for this app because:

1. **Pure-JS client** — `@supabase/supabase-js` has no native module, so it runs in Expo Go, EAS builds, and web with zero config. Firebase's fully-featured RN path (`@react-native-firebase/*`) needs native config files per platform and a dev build even to iterate.
2. **Custom confirmation email** — the brief requires a specific registration email. Supabase Auth email templates are editable per project in the dashboard (subject + full HTML body). Firebase Auth's template customization is more constrained (limited body customization on the free path).
3. **Postgres + RLS** — the scores table is one table with two policies; the "never lower a best score" rule is a 5-line SQL function instead of client logic or Cloud Functions.
4. **Store-required account deletion** — one `SECURITY DEFINER` RPC deletes auth user + data in a single transaction. Firebase needs a Cloud Function (paid tier for outbound calls) or client-side re-auth juggling.
5. **Privacy posture** — single-region Postgres you control fits "we store only email + scores, nothing else" cleanly; no cross-product analytics defaults to disable.

Costs are comparable at this scale (free tier covers launch; scores are tiny rows).

## Project setup

1. Create a project at [supabase.com](https://supabase.com) (Golden Age Games org).
2. Run `supabase/schema.sql` in the SQL editor.
3. **Auth → Providers → Email**: keep "Confirm email" **enabled** (the brief requires a real confirmation email).
4. **Auth → Email Templates → Confirm signup**: set the body to include the exact required message:

   > **Subject:** Welcome to Retro Arcade 🕹️
   >
   > **Body (HTML):**
   > ```html
   > <h2>You have successfully registered — you can enjoy a nostalgic experience with Retro Arcade</h2>
   > <p><a href="{{ .ConfirmationURL }}">Tap here to confirm your email and start playing</a></p>
   > <p>— Golden Age Games</p>
   > ```

   Localize later by switching to a custom SMTP + template hook if per-language emails are needed.
5. Copy the project URL + anon key into `.env` (see `.env.example`).

The anon key ships in the client by design; every data path is guarded by RLS.

## RevenueCat setup

1. Create a RevenueCat project "Retro Arcade" with iOS + Android apps.
2. Products: `retro_arcade_full` non-consumable at **$4.99** in App Store Connect and Play Console. Use each store's regional price tiers for India/Egypt/Brazil etc. — do not hand-set one global price.
3. Entitlement: `full_arcade`, attached to the product in both stores; single offering with one package.
4. Put the public SDK keys in `.env`. The app identifies the RevenueCat user with the Supabase user id, so entitlements follow the account across devices, and `restorePurchases` covers store-account reinstalls.

Without keys (or in Expo Go) the app uses a **mock store** so the lock/unlock flow is fully testable in development.
