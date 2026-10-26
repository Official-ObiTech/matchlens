# MatchLens — football prediction platform

Statistical football predictions for web, Android and iOS, built around one journey:

**Open app → select a game → analyse the prediction → Play This Pick _or_ Add Another Game → review slip → save → result is tracked → real performance is measured.**

The product optimises for calibrated probabilities and a verifiable track record, not for the number of picks. The engine abstains when data is weak, never fabricates statistics, and every published prediction is frozen before kickoff and settled against the official result.

## What's in the repo

```
packages/core     Shared TypeScript: types, prediction engine, markets, settlement,
                  metrics, calibration, backtesting, slip reducer, provider adapters,
                  API contracts, validation schemas. Used by web, mobile and server.
apps/web          Next.js 16 website + the HTTP API (route handlers) + scheduled jobs.
apps/mobile       Expo SDK 58 / React Native app (Expo Router, bottom tabs). Same API.
supabase/         Postgres schema, Row Level Security policies, seed rows.
docs/             Setup, deployment, architecture/upgrades, model & backtesting.
.github/          CI (typecheck, tests, build) and a 30-minute scheduler for the jobs.
```

## Quick start

```bash
npm install
cp .env.example apps/web/.env.local          # fill in Supabase + football API keys
cp apps/mobile/.env.example apps/mobile/.env.local
npm test                                     # engine, settlement, slip, providers, quota/cache, ranking
npm run dev:web                              # http://localhost:3000
npm run dev:mobile                           # Expo dev server (scan QR with Expo Go)
```

Full instructions: **[docs/SETUP.md](docs/SETUP.md)**. Deploying: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. How the model works and how to evaluate it: **[docs/MODEL.md](docs/MODEL.md)**. Architecture and upgrade paths: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Status

| Area | State |
|---|---|
| Prediction engine (Poisson + Dixon-Coles, 9 markets, abstention, confidence, calibration) | Implemented, unit-tested, backtested on simulated data |
| Provider adapters (API-Football, football-data.org) | Implemented, tested with mocked HTTP. **Not yet run against a live key.** |
| Caching, quota reserve, pacing, stale fallback, kill switches | Implemented and tested |
| Database schema + RLS | Applied and policy-tested on Postgres (PGlite) |
| Web app (all screens, slip, auth, history, admin) | Builds; UI flow verified in Chrome against engine output |
| Mobile app (5 tabs, match details, slip, history, auth, push registration) | Type-checks; iOS/Android bundles compile. **Not yet run on a device.** |
| End-to-end against a real Supabase project + live football API | **Needs your accounts/keys** — see docs/SETUP.md |
| Push notifications in production | Code complete; **needs EAS project + FCM/APNs credentials and device testing** |

No accuracy figure is claimed. Real performance appears on the History page once predictions have been settled.
