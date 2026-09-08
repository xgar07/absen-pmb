-- 1. Buat tabel events
create table if not exists public.events (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint end_time_after_start_time check (end_time > start_time)
);

-- 2. Buat tabel event_members
create table if not exists public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  panitia_id uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, panitia_id)
);

-- 3. Aktifkan RLS
alter table public.events enable row level security;
alter table public.event_members enable row level security;

-- 4. RLS events
drop policy if exists "Dosen can Insert events" on public.events;
create policy "Dosen can Insert events"
  on public.events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dosen'
    )
  );

drop policy if exists "Dosen can Select their own events" on public.events;
create policy "Dosen can Select their own events"
  on public.events for select
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dosen'
    )
  );

drop policy if exists "Dosen can Update their own events" on public.events;
create policy "Dosen can Update their own events"
  on public.events for update
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dosen'
    )
  );

drop policy if exists "Dosen can Delete their own events" on public.events;
create policy "Dosen can Delete their own events"
  on public.events for delete
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dosen'
    )
  );

drop policy if exists "Panitia can Select assigned events" on public.events;
create policy "Panitia can Select assigned events"
  on public.events for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'panitia'
    )
    and exists (
      select 1 from public.event_members
      where event_id = events.id and panitia_id = auth.uid()
    )
  );

-- 5. RLS event_members
drop policy if exists "Dosen can Insert event_members" on public.event_members;
create policy "Dosen can Insert event_members"
  on public.event_members for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dosen'
    )
    and exists (
      select 1 from public.events
      where id = event_members.event_id and created_by = auth.uid()
    )
  );

drop policy if exists "Dosen can Select event_members" on public.event_members;
create policy "Dosen can Select event_members"
  on public.event_members for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dosen'
    )
  );

drop policy if exists "Dosen can Delete event_members" on public.event_members;
create policy "Dosen can Delete event_members"
  on public.event_members for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'dosen'
    )
    and exists (
      select 1 from public.events
      where id = event_members.event_id and created_by = auth.uid()
    )
  );

drop policy if exists "Panitia can Select own event_members" on public.event_members;
create policy "Panitia can Select own event_members"
  on public.event_members for select
  using (
    panitia_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'panitia'
    )
  );
