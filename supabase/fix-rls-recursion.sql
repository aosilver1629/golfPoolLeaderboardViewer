-- FIX: RLS infinite recursion on pool_members
-- Run this in your Supabase SQL Editor

-- Drop the recursive policies
drop policy if exists "Pool members viewable by pool members" on public.pool_members;
drop policy if exists "Pools viewable by members" on public.pools;

-- pool_members: users can see their own memberships (no self-reference)
create policy "Pool members viewable by own user" on public.pool_members
  for select using (user_id = auth.uid());

-- pools: viewable if user is the creator OR has a row in pool_members
-- This works because pool_members SELECT policy no longer queries itself
create policy "Pools viewable by members" on public.pools
  for select using (
    created_by = auth.uid()
    or exists (
      select 1 from public.pool_members
      where pool_id = pools.id and user_id = auth.uid()
    )
  );
