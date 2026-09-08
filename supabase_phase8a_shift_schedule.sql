-- PHASE 8A: SHIFT & SCHEDULE FOUNDATION

-- 1. Create shifts table
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Seed basic shifts (Pagi and Siang)
insert into public.shifts (name, start_time, end_time)
select 'Pagi', '08:00:00', '13:00:00'
where not exists (select 1 from public.shifts where name = 'Pagi');

insert into public.shifts (name, start_time, end_time)
select 'Siang', '12:00:00', '17:00:00'
where not exists (select 1 from public.shifts where name = 'Siang');


-- 2. Create shift_schedules table
create table if not exists public.shift_schedules (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id) not null,
  schedule_date date not null,
  created_by uuid references public.profiles(id) not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(shift_id, schedule_date)
);

-- 3. Create shift_members table
create table if not exists public.shift_members (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.shift_schedules(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  created_at timestamp with time zone default now(),
  unique(schedule_id, user_id)
);


-- 4. Set up Row Level Security (RLS)
alter table public.shifts enable row level security;
alter table public.shift_schedules enable row level security;
alter table public.shift_members enable row level security;

-- Dosen policies (Full access)
create policy "Dosen full access on shifts" on public.shifts
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen'));

create policy "Dosen full access on shift_schedules" on public.shift_schedules
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen'));

create policy "Dosen full access on shift_members" on public.shift_members
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen'));

-- Panitia policies (Read only)
create policy "Panitia read access on shifts" on public.shifts
  for select using (exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia'));

create policy "Panitia read access on shift_schedules" on public.shift_schedules
  for select using (exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia'));

create policy "Panitia read access on shift_members" on public.shift_members
  for select using (exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia'));


-- 5. Create RPC for atomic assignment
create or replace function public.manage_shift_members(p_schedule_id uuid, p_user_ids uuid[])
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count int;
begin
  -- 1. Authorization
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role != 'dosen' then
    return json_build_object('success', false, 'error', 'Hanya Dosen yang dapat memanajemen shift');
  end if;

  -- 2. Validate schedule exists
  if not exists (select 1 from public.shift_schedules where id = p_schedule_id) then
    return json_build_object('success', false, 'error', 'Jadwal shift tidak ditemukan');
  end if;

  -- 3. Delete members not in the new list
  delete from public.shift_members 
  where schedule_id = p_schedule_id 
  and user_id != all(p_user_ids);

  -- 4. Insert new members (on conflict do nothing)
  insert into public.shift_members (schedule_id, user_id)
  select p_schedule_id, unnest(p_user_ids)
  on conflict (schedule_id, user_id) do nothing;

  select count(*) into v_count from public.shift_members where schedule_id = p_schedule_id;

  return json_build_object('success', true, 'message', 'Member updated successfully', 'count', v_count);
end;
$$;
grant execute on function public.manage_shift_members(uuid, uuid[]) to authenticated;
