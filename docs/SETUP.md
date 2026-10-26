# Setup

## 1. Prerequisites

- Node.js 20.9+ (24 recommended) and npm 10+
- A free [Supabase](https://supabase.com) account
- A free football data key: [API-Football](https://dashboard.api-football.com/register) (default) **or** [football-data.org](https://www.football-data.org/client/register)
- For mobile: the Expo Go app on a phone, or Android Studio / Xcode for emulators
- Optional: an [Expo](https://expo.dev) account (EAS builds and push notifications)

## 2. Install

```bash
npm install
```

## 3. Create the database (Supabase, free tier)

1. Create a project in the Supabase dashboard.
2. Open **SQL Editor**, paste the contents of `supabase/migrations/20261026000000_init.sql`, and run it.
   (Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. **Project Settings → API**: copy the Project URL, the `anon` public key and the `service_role` key.
4. **Authentication → URL Configuration**: set the Site URL to your web URL (`http://localhost:3000` locally) and add it under Redirect URLs (used by email sign-in links).
5. Make yourself an administrator after signing up once in the app:
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
   ```

## 4. Football API key

**API-Football (default).** Register, copy the key from the dashboard. The free plan allows about 100 requests/day and 10/minute. Free plans may be restricted to certain seasons. If the current season is not included, the sync job logs a `plan:` error in the admin dashboard and no fixtures appear. In that case, use football-data.org or set `FOOTBALL_SEASON` to a season your plan includes (useful for backtesting).

**football-data.org (alternative).** Register, copy the token. The free tier covers 12 competitions, 10 calls/minute, delayed scores, and no lineups or odds. Set:
```
FOOTBALL_DATA_PROVIDER=football_data
```
Default competitions per provider are in `packages/core/src/providers/index.ts`; override with `FOOTBALL_COMPETITIONS` (comma-separated provider ids).

Verify current quotas and terms (including commercial use) on each provider's pricing page before relying on them.

## 5. Environment variables

```bash
cp .env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
```

| Variable | Where | Notes |
|---|---|---|
| `FOOTBALL_DATA_PROVIDER`, `FOOTBALL_API_KEY` | web (server) | Never exposed to clients |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Public by design (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server) | **Secret.** Bypasses RLS. Never in mobile/web bundles |
| `CRON_SECRET` | web (server) | `openssl rand -hex 24` |
| `EXPO_PUBLIC_API_URL` | mobile | URL of the web app. On a physical phone use your computer's LAN IP, e.g. `http://192.168.1.20:3000` |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | Same public values as the web |

`GET /api/health` reports which integrations are configured (booleans only).

## 6. Run locally

```bash
npm run dev:web        # http://localhost:3000
```

Load data the first time (and whenever you want a manual refresh):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/predict
```

…or use **Admin → Run sync / Run predict**. `/api/cron/all` runs sync → predict → settle → reminders.

One sync costs about two requests per competition per day: the current season is cached for 6 hours and the previous season for 30 days. Each response contains the whole season's fixtures and results, so form, home/away splits, head-to-head and the computed table need no extra calls.

Mobile:

```bash
npm run dev:mobile     # then press i / a, or scan the QR code with Expo Go
```

## 7. Tests

```bash
npm test               # core (engine, settlement, slip, metrics, providers) + web (quota/cache, ranking)
npm run typecheck
```

## 8. Backtest on real data

```bash
npm run backtest -- --competition 39 --seasons 2022,2023 --test-from 2023-08-01
```
Uses one API request per season. See [MODEL.md](MODEL.md) for how to read the output.

## 9. Push notifications

Push notifications go through the free Expo Push Service, which forwards them to FCM (Android) and APNs (iOS).

1. `cd apps/mobile && npx eas-cli@latest init`. This writes `extra.eas.projectId` into `app.json`.
2. Change `ios.bundleIdentifier` and `android.package` in `app.json` to your own identifiers.
3. **Android:** create a Firebase project and upload the FCM V1 service-account key in EAS (`npx eas-cli credentials`, or expo.dev → project → Credentials).
4. **iOS:** requires a paid Apple Developer Program membership. EAS generates the APNs key during `eas build`.
5. Build a development build (`npx eas-cli build --profile development`). Push tokens are only issued on physical devices.
6. In the app, save a prediction and tap **Notify me**, or go to **Profile → Enable push on this device**.
7. Test with https://expo.dev/notifications or wait for a kickoff reminder.

The app asks for notification permission only after the user saves a prediction, never on first launch. Each (user, kind, reference) is sent at most once; expired tokens are disabled automatically.

**Push notifications have not been tested on a real device yet.** Treat them as unverified until you complete the steps above.
