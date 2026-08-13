-- Retro Arcade — Supabase schema
-- Run in the Supabase SQL editor (or via supabase db push).
-- Data collected, in full: email + password (managed by Supabase Auth) and
-- game scores below. Nothing else — that is the privacy promise.

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
