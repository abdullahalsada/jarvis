# Retro Arcade 🕹️

**Golden Age Games** — a mobile collection of classic 70s–90s arcade and handheld games, rebuilt with original names and art. One-time $4.99 purchase, no subscriptions, **no ads, ever**.

Built with React Native + Expo (single codebase, iOS + Android), Supabase (auth + scores), RevenueCat (the one $4.99 non-consumable IAP).

## Quick start

```bash
npm install
cp .env.example .env       # fill in Supabase + RevenueCat keys (optional for dev)
npm start                  # Expo dev server → run in Expo Go or a dev build
```

With no `.env` keys the app runs in **guest mode**: auth is skipped, purchases use a mock store, scores stay local. Perfect for iterating on games in Expo Go.

Backend setup (Supabase project, confirmation-email template, RevenueCat products): see [docs/BACKEND.md](docs/BACKEND.md). Store submission items: [docs/STORE-COMPLIANCE.md](docs/STORE-COMPLIANCE.md).

## What's here (milestones 1–4 of the brief)

- **App flow**: Splash → language select (first run, EN/العربية with full RTL) → register/login → catalog
- **8 starter games** on a shared engine, each with instructions overlay, pause, per-account best scores, synth SFX + haptics:
  - Classics: Snake 🐍, Brick Breaker 🧱, Paddle Duel 🏓
  - Action: Space Defenders 👾, Meteor Dodge ☄️
  - Spooky: Haunted Maze 👻
  - Brain: Memory Match 🃏 (free), Simon Echo 🎵 — Snake is the other free demo game
- **Demo lock/unlock**: full catalog visible; locked games route to the $4.99 purchase screen (localized store price, restore-purchases button)
- **Settings**: language, sound, vibration, scanlines, logout, account deletion, plain-language privacy statement
- **Offline-first scores**: local best always saved; queued sync to Supabase when online

## Architecture notes

- `src/games/engine/` — `GameShell` (HUD, overlays, score submit), `useGameLoop`/`useTick`, touch controls (swipe with input buffering; slide paddles respond on pointer-down)
- `src/games/<id>/` — one folder per game; register in `src/games/registry.tsx` (a new game = component + registry row + strings in every `src/i18n/locales/*.json`)
- `src/audio/synth.ts` — runtime chiptune synth (square/triangle/noise → WAV data URIs); no audio assets, era-appropriate by construction
- `src/i18n/` — react-i18next; adding a language = one JSON file + one registry line (`RTL_LANGUAGES` for RTL scripts)
- Rendering is plain RN Views (all games are chunky rectangles). If a future game needs more, migrate the render layer to `@shopify/react-native-skia` — the engine API already isolates simulation from drawing.

## Game-feel acceptance criteria

Authenticity is the bar (the prototype's Snake was rejected until it felt right). Each game documents its classic rules in a header comment — speed ramps, scoring bands, buffered turns, the Invaders speed-up-as-they-die march. Test on device with sound + haptics on before calling any game done.

## Roadmap

- Milestone 5: +10 games (Asteroids-style, road crosser, falling blocks, Minesweeper, Solitaire, 2048-style, whac-a-mole, flappy-style, tunneler, missile defense — mechanics only, original names/art)
- Milestone 6: EAS builds → TestFlight / Play internal testing
- Original pixel-art icons to replace emoji placeholders; bundled pixel font; more languages (es, fr, hi, zh)
