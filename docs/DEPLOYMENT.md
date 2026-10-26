# Deployment

## Web + API (Vercel Hobby, free)

1. Push the repository to GitHub.
2. In Vercel: **Add New → Project**, import the repo, set **Root Directory = `apps/web`**. The framework is detected as Next.js; Vercel installs the npm workspaces from the repo root.
3. Add every variable from `.env.example` under **Settings → Environment Variables**. Mark the service-role key, football key and cron secret as server-only. They have no `NEXT_PUBLIC_` prefix, so Next.js never bundles them.
4. Deploy. Set the Supabase Auth Site URL / Redirect URLs to the production domain.
5. Check `https://<your-app>/api/health`.

**Scheduling.** `apps/web/vercel.json` registers a daily cron on `/api/cron/all`, and Vercel sends `CRON_SECRET` automatically. Hobby crons run at most once per day, which is not enough for timely settlement and kickoff reminders. `.github/workflows/cron.yml` therefore calls the same endpoint every 30 minutes; add the `APP_URL` and `CRON_SECRET` repository secrets. On a private repo, that uses roughly 1,500 of the 2,000 free GitHub Actions minutes per month; on a public repo it is free. Alternatively, use Supabase `pg_cron` + `pg_net` to call the URL.

**Free-tier caveats (verify current terms):**
- Vercel Hobby is for personal, non-commercial use. A revenue-generating product needs Pro.
- Supabase Free pauses projects after about a week without activity and has a 500 MB database limit. The scheduled jobs keep it active.
- Function duration limits apply. Jobs stop at a 45-second budget and resume on the next run.

## Mobile

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init                       # once; sets the project ID
npx eas-cli@latest build --profile preview --platform android   # installable APK for testing
npx eas-cli@latest build --profile production --platform all    # store builds
npx eas-cli@latest submit --platform android|ios
```

Set `EXPO_PUBLIC_*` values for builds with `eas env:create`, or in an `.env` file present at build time. They are public by design.

- The EAS free plan includes a limited number of builds per month; check the current allowance. You can also build locally with `npx expo run:android` / `run:ios`.
- Google Play requires a one-time developer registration fee. Distributing on iOS requires the paid Apple Developer Program. **These are the only unavoidable costs for store release. Nothing in this repository purchases them.**

## Production security checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `FOOTBALL_API_KEY` and `CRON_SECRET` exist only in server environments.
- [ ] The migration ran with all RLS policies, and **Database → Advisors** shows no RLS warnings.
- [ ] Supabase Auth email confirmation is enabled; the redirect URLs list only your domains.
- [ ] At least one admin is set via SQL. The admin role cannot be changed from clients (column privileges).
- [ ] The rate limits in route handlers suit your traffic (`hit_rate_limit` in Postgres).
- [ ] The CI workflow passes on the main branch.

## Backup and recovery

- Supabase Free has no point-in-time recovery. Take scheduled logical backups:
  `pg_dump "$DATABASE_URL" --schema=public -Fc -f backup-$(date +%F).dump` (connection string under Settings → Database).
- Restore into a new project: run the migration, then `pg_restore --data-only -d "$NEW_DATABASE_URL" backup.dump`.
- `predictions` and `prediction_settlements` are the irreplaceable track record. Back them up before any model or schema change.
- Football data can always be re-synced from the provider. Cached rows (`api_cache`) are disposable.
