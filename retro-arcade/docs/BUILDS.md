# Milestone 6 — TestFlight / Play Internal Testing builds

Everything code-side is ready (`eas.json` profiles below). The steps marked 👤 need the Orbit Oryx accounts and cannot be automated from a session.

## One-time setup

1. 👤 Create an [Expo account](https://expo.dev) (free) and an EAS project: `npx eas init` inside `retro-arcade/` (adds `extra.eas.projectId` to `app.json`).
2. 👤 Enroll in the [Apple Developer Program](https://developer.apple.com) ($99/yr) and [Google Play Console](https://play.google.com/console) ($25 once).
3. Set the client env vars as EAS build secrets (they're public-by-design client keys, but keeping them out of git follows this repo's rules):

   ```bash
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<project>.supabase.co --environment production
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key> --environment production
   eas env:create --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_OdsWeaTwVSLSGaMKwdIjOFknCZO --environment production
   eas env:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_FMEubgkLBBlHTYFkzapOGzSsdgw --environment production
   ```

   Repeat with `--environment preview` for internal-testing builds.

## Build profiles (`eas.json`)

| Profile | Use | Notes |
|---|---|---|
| `development` | day-to-day dev with native modules (RevenueCat) | dev client, iOS simulator enabled |
| `preview` | internal testers | APK for easy Android sideloading, `preview` update channel |
| `production` | TestFlight / Play internal → store release | auto-incrementing build numbers |

## Building

```bash
npx eas build --profile preview --platform all      # internal testing builds
npx eas build --profile production --platform all   # store builds
npx eas submit --platform ios                       # → TestFlight
npx eas submit --platform android                   # → Play internal track
```

Notes:
- `react-native-purchases` is a native module, so **Expo Go cannot test real purchases** — use a `development` build for that. The in-app mock store covers UI flows.
- iOS release will ask for App Store Connect credentials on first `eas submit`; Android needs a Play service-account JSON (also used by RevenueCat — see BACKEND.md).
- The store products (`retro_arcade_full`, $4.99 + regional tiers) must exist in App Store Connect / Play Console before a reviewable purchase flow works end to end.
