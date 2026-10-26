-- Football prediction platform — initial schema.
-- Apply with: supabase db push   (or paste into the Supabase SQL editor)
--
-- Access model
--   * Public football data and published (model) predictions: readable by anyone.
--   * Slips, selections, notification prefs, push tokens: owner only (RLS).
--   * Operational tables (cache, usage, logs, settings, rate limits): no policies,
--     so only the service role used by the server can touch them.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Football reference data (provider-qualified so providers can coexist)
-- ---------------------------------------------------------------------------
create table public.competitions (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_id text not null,
  season int not null,
  name text not null,
  country text,
  logo_url text,
  updated_at timestamptz not null default now(),
  unique (provider, provider_id, season)
);

create table public.teams (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_id text not null,
  name text not null,
  short_name text,
  logo_url text,
  updated_at timestamptz not null default now(),
  unique (provider, provider_id)
);

create table public.fixtures (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_id text not null,
  competition_id bigint not null references public.competitions (id),
  home_team_id bigint not null references public.teams (id),
  away_team_id bigint not null references public.teams (id),
  kickoff_at timestamptz not null,
  status text not null check (status in ('scheduled','tbd','live','finished','postponed','suspended','cancelled','abandoned','awarded','unknown')),
  status_detail text,
  venue text,
  rt_home int, rt_away int,       -- regular time (90') score
  ht_home int, ht_away int,       -- half-time score
  final_home int, final_away int, -- incl. extra time
  data_updated_at timestamptz not null default now(),
  unique (provider, provider_id)
);
create index fixtures_kickoff_idx on public.fixtures (kickoff_at);
create index fixtures_competition_idx on public.fixtures (competition_id, kickoff_at);
create index fixtures_status_idx on public.fixtures (status, kickoff_at);
create index fixtures_home_idx on public.fixtures (home_team_id);
create index fixtures_away_idx on public.fixtures (away_team_id);

-- Derived per-team summaries (computed by the server from stored results).
create table public.team_statistics (
  team_id bigint not null references public.teams (id) on delete cascade,
  competition_id bigint not null references public.competitions (id) on delete cascade,
  computed_at timestamptz not null default now(),
  stats jsonb not null,
  primary key (team_id, competition_id)
);

-- ---------------------------------------------------------------------------
-- Model versions and prediction records
-- ---------------------------------------------------------------------------
create table public.model_versions (
  id text primary key,
  description text not null,
  params jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- One snapshot of the engine output per fixture/model/generation. Holds the
-- full market table once instead of copying it into every prediction row.
create table public.prediction_runs (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  model_version text not null references public.model_versions (id),
  generated_at timestamptz not null default now(),
  input_data_at timestamptz,
  expected_home numeric(6,4),
  expected_away numeric(6,4),
  markets jsonb not null,
  quality jsonb not null,
  team_context jsonb,
  abstained boolean not null,
  abstain_reasons text[] not null default '{}'
);
create index prediction_runs_fixture_idx on public.prediction_runs (fixture_id, generated_at desc);

-- A published recommendation. Written once (at first publication) and never
-- recomputed, so history always reflects what the model said at the time.
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  fixture_id bigint not null references public.fixtures (id) on delete cascade,
  run_id uuid not null references public.prediction_runs (id),
  model_version text not null references public.model_versions (id),
  market text not null,
  outcome text not null,
  line numeric(4,1),
  label text not null,
  raw_probability numeric(6,4) not null check (raw_probability between 0 and 1),
  probability numeric(6,4) not null check (probability between 0 and 1),
  model_confidence numeric(6,4) not null check (model_confidence between 0 and 1),
  data_quality text not null check (data_quality in ('A','B','C','D')),
  calibrated boolean not null default false,
  reasoning text[] not null default '{}',
  input_data_at timestamptz,
  published_at timestamptz not null default now(),
  kickoff_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  settled_at timestamptz,
  unique (fixture_id, model_version)
);
create index predictions_status_idx on public.predictions (status, kickoff_at);
create index predictions_kickoff_idx on public.predictions (kickoff_at desc);

-- Audit row per settlement; the unique constraint prevents double settlement.
create table public.prediction_settlements (
  id bigint generated always as identity primary key,
  prediction_id uuid not null unique references public.predictions (id) on delete cascade,
  outcome text not null check (outcome in ('won','lost','void')),
  rt_home int, rt_away int,
  reason text not null,
  source text not null,
  settled_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- User slips
-- ---------------------------------------------------------------------------
create table public.prediction_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 80),
  share_token text unique default encode(gen_random_bytes(9), 'hex'),
  status text not null default 'pending' check (status in ('pending','won','lost','void','partial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prediction_slips_user_idx on public.prediction_slips (user_id, created_at desc);

create table public.slip_selections (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null references public.prediction_slips (id) on delete cascade,
  fixture_id bigint not null references public.fixtures (id),
  run_id uuid references public.prediction_runs (id),
  model_version text references public.model_versions (id),
  market text not null,
  outcome text not null,
  line numeric(4,1),
  label text not null,
  probability numeric(6,4) check (probability between 0 and 1),
  data_quality text check (data_quality in ('A','B','C','D')),
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  settled_at timestamptz,
  unique (slip_id, fixture_id) -- one selection per match per slip
);
create index slip_selections_fixture_idx on public.slip_selections (fixture_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kickoff_reminders boolean not null default true,
  results boolean not null default true,
  settlement boolean not null default true,
  match_changes boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.push_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios','android','web')),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index push_tokens_user_idx on public.push_tokens (user_id) where disabled_at is null;

create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  ref_id text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref_id) -- prevents duplicate notifications
);

-- ---------------------------------------------------------------------------
-- Operations (service role only)
-- ---------------------------------------------------------------------------
create table public.sync_logs (
  id bigint generated always as identity primary key,
  job text not null,
  status text not null check (status in ('running','ok','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  error text
);
create index sync_logs_job_idx on public.sync_logs (job, started_at desc);

create table public.api_usage (
  provider text not null,
  day date not null,
  requests int not null default 0,
  failures int not null default 0,
  last_remaining int,
  updated_at timestamptz not null default now(),
  primary key (provider, day)
);

create table public.api_cache (
  key text primary key,
  provider text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Atomic usage counter for the provider quota.
create function public.record_api_request(p_provider text, p_ok boolean, p_remaining int)
returns int language sql security definer set search_path = public as $$
  insert into api_usage (provider, day, requests, failures, last_remaining)
  values (p_provider, (now() at time zone 'utc')::date, 1, case when p_ok then 0 else 1 end, p_remaining)
  on conflict (provider, day) do update set
    requests = api_usage.requests + 1,
    failures = api_usage.failures + case when p_ok then 0 else 1 end,
    last_remaining = coalesce(p_remaining, api_usage.last_remaining),
    updated_at = now()
  returning requests;
$$;

-- Fixed-window rate limiter. Returns true when the request is allowed.
create function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c int;
begin
  insert into rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into c;
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;
  return c <= p_limit;
end $$;

revoke execute on function public.record_api_request(text, boolean, int) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.fixtures enable row level security;
alter table public.team_statistics enable row level security;
alter table public.model_versions enable row level security;
alter table public.prediction_runs enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_settlements enable row level security;
alter table public.prediction_slips enable row level security;
alter table public.slip_selections enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_log enable row level security;
alter table public.sync_logs enable row level security;
alter table public.api_usage enable row level security;
alter table public.api_cache enable row level security;
alter table public.app_settings enable row level security;
alter table public.rate_limits enable row level security;

-- Public, read-only football data and published model output.
create policy "public read" on public.competitions for select using (true);
create policy "public read" on public.teams for select using (true);
create policy "public read" on public.fixtures for select using (true);
create policy "public read" on public.team_statistics for select using (true);
create policy "public read" on public.model_versions for select using (true);
create policy "public read" on public.prediction_runs for select using (true);
create policy "public read" on public.predictions for select using (true);
create policy "public read" on public.prediction_settlements for select using (true);

-- Profiles: users read and rename themselves; role is not client-writable.
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Slips: owner only.
create policy "own slips" on public.prediction_slips for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own selections" on public.slip_selections for all
  using (exists (select 1 from public.prediction_slips s where s.id = slip_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.prediction_slips s where s.id = slip_id and s.user_id = auth.uid()));
-- Slips are created only by the server (which sets probabilities from stored
-- model runs) and settled only by the server. Owners can read, rename and delete.
revoke insert on public.prediction_slips from anon, authenticated;
revoke insert on public.slip_selections from anon, authenticated;
revoke update on public.slip_selections from anon, authenticated;
revoke update on public.prediction_slips from anon, authenticated;
grant update (name, updated_at) on public.prediction_slips to authenticated;

create policy "own prefs" on public.notification_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tokens" on public.push_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notification log" on public.notification_log for select using (auth.uid() = user_id);

-- Seed the initial model version and default settings.
insert into public.model_versions (id, description, params) values
  ('poisson-dc-1.0.0', 'Time-decayed Maher Poisson ratings with Dixon-Coles low-score adjustment; shrinkage toward league mean.',
   '{"halfLifeDays":180,"shrinkage":4,"minProbability":0.7,"minConfidence":0.55}');

insert into public.app_settings (key, value) values
  ('provider_enabled', 'true'),
  ('model_enabled', 'true'),
  ('quota_reserve_fraction', '0.15');
