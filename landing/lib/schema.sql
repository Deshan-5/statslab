-- Stats Lab — Supabase schema (reference only; not auto-run)
-- Run this in the Supabase SQL editor to provision the auth-backed tables.

-- Profiles table -----------------------------------------------------------
create table if not exists public.profiles (
  id          text primary key,
  email       text,
  name        text,
  image       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can read/write only their own profile row.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid()::text = id);

create policy "profiles_upsert_own"
  on public.profiles for insert
  with check (auth.uid()::text = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid()::text = id)
  with check (auth.uid()::text = id);

-- Saved analyses -----------------------------------------------------------
create table if not exists public.saved_analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  tool_id     text not null,
  title       text not null,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists saved_analyses_user_idx
  on public.saved_analyses (user_id, updated_at desc);

alter table public.saved_analyses enable row level security;

create policy "saved_analyses_select_own"
  on public.saved_analyses for select
  using (auth.uid()::text = user_id);

create policy "saved_analyses_insert_own"
  on public.saved_analyses for insert
  with check (auth.uid()::text = user_id);

create policy "saved_analyses_update_own"
  on public.saved_analyses for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "saved_analyses_delete_own"
  on public.saved_analyses for delete
  using (auth.uid()::text = user_id);
