-- Golf Pool Leaderboard Database Schema
-- Run this in your Supabase SQL Editor to set up all tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  email text not null,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pools table
create table public.pools (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  tournament_id text,
  status text default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  invite_code text unique not null,
  entry_fee numeric,
  max_entries_per_user integer default 3,
  created_by uuid references public.profiles(id) not null,
  lock_date timestamptz,
  created_at timestamptz default now()
);

-- Pool members (users who joined via invite code)
create table public.pool_members (
  id uuid default uuid_generate_v4() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  joined_at timestamptz default now(),
  unique(pool_id, user_id)
);

-- Groups (A, B, C, D)
create table public.groups (
  id uuid default uuid_generate_v4() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  name text not null,
  sort_order integer not null
);

-- Golfers assigned to groups
create table public.group_golfers (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  golfer_name text not null,
  golfer_api_id text
);

-- Entries (each row = one team submission)
create table public.entries (
  id uuid default uuid_generate_v4() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  user_id uuid references public.profiles(id),
  entry_name text not null,
  tiebreaker_score integer,
  total_points numeric default 0,
  rank integer,
  created_at timestamptz default now()
);

-- Individual golfer picks per entry
create table public.entry_picks (
  id uuid default uuid_generate_v4() primary key,
  entry_id uuid references public.entries(id) on delete cascade not null,
  golfer_name text not null,
  golfer_api_id text,
  pick_type text not null check (pick_type in ('group_a', 'group_b', 'group_c', 'group_d', 'wildcard')),
  current_position text,
  current_points numeric default 0
);

-- Cached tournament leaderboard from golf API
create table public.tournament_leaderboard (
  id uuid default uuid_generate_v4() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  golfer_name text not null,
  golfer_api_id text not null,
  position integer,
  position_display text default '',
  score_to_par integer default 0,
  current_round integer default 1,
  thru text default '',
  total_score integer,
  updated_at timestamptz default now(),
  unique(pool_id, golfer_api_id)
);

-- Points table (maps finishing position to points)
create table public.points_table (
  id uuid default uuid_generate_v4() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  position_start integer not null,
  position_end integer not null,
  points numeric not null
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.groups enable row level security;
alter table public.group_golfers enable row level security;
alter table public.entries enable row level security;
alter table public.entry_picks enable row level security;
alter table public.tournament_leaderboard enable row level security;
alter table public.points_table enable row level security;

-- Profiles: users can read all profiles, update their own
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Pools: viewable by any authenticated user (invite codes are unguessable; needed so users can look up a pool to join before they're a member)
create policy "Authenticated users can look up any pool" on public.pools
  for select using (auth.uid() is not null);
create policy "Authenticated users can create pools" on public.pools for insert with check (auth.uid() = created_by);
create policy "Pool creators can update their pools" on public.pools for update using (created_by = auth.uid());

-- Pool members: users can see their own memberships (avoids self-referencing recursion)
create policy "Pool members viewable by own user" on public.pool_members for select using (
  user_id = auth.uid()
);
create policy "Users can join pools" on public.pool_members for insert with check (auth.uid() = user_id);

-- Groups: viewable by pool members
create policy "Groups viewable by pool members" on public.groups for select using (
  exists (select 1 from public.pool_members where pool_id = groups.pool_id and user_id = auth.uid())
  or exists (select 1 from public.pools where id = groups.pool_id and created_by = auth.uid())
);
create policy "Pool creators can manage groups" on public.groups for all using (
  exists (select 1 from public.pools where id = groups.pool_id and created_by = auth.uid())
);

-- Group golfers: viewable by pool members
create policy "Group golfers viewable by pool members" on public.group_golfers for select using (
  exists (
    select 1 from public.groups g
    join public.pool_members pm on pm.pool_id = g.pool_id
    where g.id = group_golfers.group_id and pm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.groups g
    join public.pools p on p.id = g.pool_id
    where g.id = group_golfers.group_id and p.created_by = auth.uid()
  )
);
create policy "Pool creators can manage group golfers" on public.group_golfers for all using (
  exists (
    select 1 from public.groups g
    join public.pools p on p.id = g.pool_id
    where g.id = group_golfers.group_id and p.created_by = auth.uid()
  )
);

-- Entries: viewable by pool members
create policy "Entries viewable by pool members" on public.entries for select using (
  exists (select 1 from public.pool_members where pool_id = entries.pool_id and user_id = auth.uid())
  or exists (select 1 from public.pools where id = entries.pool_id and created_by = auth.uid())
);
create policy "Pool creators can manage entries" on public.entries for all using (
  exists (select 1 from public.pools where id = entries.pool_id and created_by = auth.uid())
);
create policy "Users can claim entries" on public.entries for update using (
  -- claiming: pool member on an unclaimed entry
  (entries.user_id is null and exists (
    select 1 from public.pool_members
    where pool_id = entries.pool_id and user_id = auth.uid()
  ))
  or
  -- unclaiming: current owner
  entries.user_id = auth.uid()
) with check (
  user_id = auth.uid()  -- claiming: new value is yourself
  or user_id is null    -- unclaiming: new value is null (USING ensures you're the owner)
);

-- Entry picks: viewable by pool members
create policy "Entry picks viewable by pool members" on public.entry_picks for select using (
  exists (
    select 1 from public.entries e
    join public.pool_members pm on pm.pool_id = e.pool_id
    where e.id = entry_picks.entry_id and pm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.entries e
    join public.pools p on p.id = e.pool_id
    where e.id = entry_picks.entry_id and p.created_by = auth.uid()
  )
);
create policy "Pool creators can manage entry picks" on public.entry_picks for all using (
  exists (
    select 1 from public.entries e
    join public.pools p on p.id = e.pool_id
    where e.id = entry_picks.entry_id and p.created_by = auth.uid()
  )
);

-- Tournament leaderboard: viewable by pool members
create policy "Leaderboard viewable by pool members" on public.tournament_leaderboard for select using (
  exists (select 1 from public.pool_members where pool_id = tournament_leaderboard.pool_id and user_id = auth.uid())
  or exists (select 1 from public.pools where id = tournament_leaderboard.pool_id and created_by = auth.uid())
);

-- Points table: viewable by pool members
create policy "Points table viewable by pool members" on public.points_table for select using (
  exists (select 1 from public.pool_members where pool_id = points_table.pool_id and user_id = auth.uid())
  or exists (select 1 from public.pools where id = points_table.pool_id and created_by = auth.uid())
);
create policy "Pool creators can manage points table" on public.points_table for all using (
  exists (select 1 from public.pools where id = points_table.pool_id and created_by = auth.uid())
);
