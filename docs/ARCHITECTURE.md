# Architecture and upgrade paths

```
 Expo app ─┐                         ┌─> FootballService ─> FootballDataProvider (API-Football | football-data.org | …)
           ├─ HTTPS (bearer JWT) ─> Next.js route handlers ─┤        (cache, quota reserve, pacing, stale fallback)
 Website  ─┘   apps/web/src/app/api  │
                                     ├─> repo.ts (all DB access) ─> Supabase Postgres (RLS)
                                     └─> @fpp/core engine (pure, deterministic, no I/O)
 Scheduler (Vercel Cron / GitHub Actions) ─> /api/cron/{sync,predict,settle,reminders}
```

## Boundaries

| Concern | Lives in | Swap by |
|---|---|---|
| Football data | `packages/core/src/providers/*` behind `FootballDataProvider` | Implement the interface, map to the `Fixture` model, register in `createProvider`, set `FOOTBALL_DATA_PROVIDER` |
| Quota, cache, rate limits | `apps/web/src/lib/server/footballService.ts` (pure) + `football.ts` (Supabase store) | Replace the `FootballStore` implementation (e.g. with Redis) |
| Prediction model | `packages/core/src/engine/*` | Add a new model, bump `MODEL_VERSION`, insert a `model_versions` row |
| Persistence | `apps/web/src/lib/server/repo.ts`, `queries.ts`, `jobs.ts` | Only these files talk to the database |
| Auth | Supabase Auth; server verifies the JWT in `auth.ts` | Replace `getUser()` |
| Notifications | `apps/web/src/lib/server/notify.ts` (Expo Push) | Replace `sendNotifications()` |
| Hosting | Next.js route handlers; no host-specific APIs except the optional `vercel.json` cron | Any Node host that runs Next.js |

Web and mobile call the same API and render the same stored model runs, so both always show identical predictions. The engine never runs in clients.

## Data flow and integrity

1. **sync:** one provider request per competition season returns all of its fixtures and results. Rows are upserted, and kickoff/status changes are detected and notified.
2. **predict:** for fixtures within 72 hours, the engine runs on stored results only (no provider calls). Each run is stored as a `prediction_runs` snapshot. Within 24 hours of kickoff, the recommendation is **published** once per fixture and model version (`unique(fixture_id, model_version)`) and never overwritten.
3. **settle:** after kickoff + 110 minutes, only non-final fixtures are refreshed, using the quota reserve. Markets settle on the 90-minute score. Postponed matches void after 72 hours; cancelled, abandoned and awarded matches void immediately. A unique `prediction_settlements` row prevents double settlement.
4. **Performance** is computed only from settled `predictions` rows. Pending and void rows never count.

Users cannot write slips, selections, predictions or settlement fields directly. The server inserts slips with the service role and takes probabilities from stored runs, not from the client.

## Upgrade paths

| From → To | What to do | Migration? |
|---|---|---|
| Free → paid football API (same provider) | Raise `FOOTBALL_DAILY_LIMIT`, add competitions, shorten cache TTLs in `jobs.ts` | No |
| Add a richer provider (xG, odds, lineups, injuries) | New adapter + new capability flags; add model features only when a backtest shows they help | Possibly new columns or tables for odds/lineups |
| Odds-aware model | Store odds per fixture; compare model vs de-margined implied probabilities in `backtest.ts`; new `MODEL_VERSION` | Yes (odds table) |
| Supabase Free → Pro | In-place plan change, no data movement. Enables PITR and removes pausing | No |
| Vercel Hobby → Pro | Plan change; switch `vercel.json` cron to every 15–30 minutes and drop the GitHub workflow | No |
| New model version | Bump `MODEL_VERSION`, insert a `model_versions` row, deploy. Old predictions keep their version; calibration and performance are tracked per version | Insert row only |
| Personalised notifications | Extend `notification_preferences`; scheduling stays in `jobs.ts` | Column additions |

Any upgrade should be justified by a measured limitation (quota exhaustion, stale data, abstention rate) or a measured accuracy or calibration improvement.
