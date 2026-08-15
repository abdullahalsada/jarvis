-- Retro Arcade — Supabase schema
-- Run in the Supabase SQL editor (or via supabase db push).
-- Data collected, in full: a chosen player name and game scores. Nothing
-- else — that is the privacy promise. Accounts are ANONYMOUS (no email):
-- enable "Allow anonymous sign-ins" under Auth → Providers in the dashboard.

-- ─── Player profiles (username-only identity) ───────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  -- Store-account identity (Game Center / Play Games), linked by the app in
  -- dev builds so scores follow the player's store account across devices.
  platform text check (platform in ('game_center', 'play_games')),
  platform_player_id text,
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));
create unique index if not exists profiles_platform_player_idx
  on public.profiles (platform, platform_player_id)
  where platform_player_id is not null;

alter table public.profiles enable row level security;
create policy "own profile: select" on public.profiles
  for select using (auth.uid() = id);

-- Claim (or change) the caller's player name. Returns 'ok' | 'taken' | 'invalid'.
create or replace function public.claim_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    return 'invalid';
  end if;
  insert into public.profiles (id, username, updated_at)
  values (auth.uid(), p_username, now())
  on conflict (id) do update set username = excluded.username, updated_at = now();
  return 'ok';
exception when unique_violation then
  return 'taken';
end;
$$;

revoke all on function public.claim_username(text) from anon;
grant execute on function public.claim_username(text) to authenticated, anon;

-- ─── High scores ────────────────────────────────────────────────────────────
-- One row per (user, game): we keep only the personal best.
create table if not exists public.scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  score   integer not null check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.scores enable row level security;

-- Players can read and write only their own scores.
create policy "own scores: select" on public.scores
  for select using (auth.uid() = user_id);
create policy "own scores: insert" on public.scores
  for insert with check (auth.uid() = user_id);
create policy "own scores: update" on public.scores
  for update using (auth.uid() = user_id);

-- Upsert that never lowers a best score (client calls this RPC).
create or replace function public.submit_score(p_game_id text, p_score integer)
returns void
language sql
security invoker
as $$
  insert into public.scores (user_id, game_id, score, updated_at)
  values (auth.uid(), p_game_id, p_score, now())
  on conflict (user_id, game_id)
  do update set score = excluded.score, updated_at = now()
  where public.scores.score < excluded.score;
$$;

-- ─── Account deletion (store-required) ──────────────────────────────────────
-- Removes the auth user; scores cascade. SECURITY DEFINER because deleting
-- from auth.users requires elevated rights; scoped strictly to auth.uid().
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;
