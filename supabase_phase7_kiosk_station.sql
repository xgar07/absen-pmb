-- Phase 7B: Kiosk Station Pairing & Web Crypto Challenge-Response

create table if not exists public.attendance_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  public_key text, -- SPKI Base64
  is_active boolean not null default true,
  pairing_code text, -- 6 digit PIN
  pairing_expires_at timestamp with time zone,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Unique constraint for active pairing code to avoid conflicts
create unique index if not exists unique_active_pairing_code 
  on public.attendance_stations(pairing_code) 
  where pairing_code is not null;

create table if not exists public.kiosk_challenges (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.attendance_stations(id) on delete cascade,
  challenge text not null,
  is_used boolean not null default false,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

-- RLS
alter table public.attendance_stations enable row level security;
alter table public.kiosk_challenges enable row level security;

drop policy if exists "Dosen can view and manage stations" on public.attendance_stations;
create policy "Dosen can view and manage stations" on public.attendance_stations
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
  );

drop policy if exists "No direct access to challenges" on public.kiosk_challenges;
create policy "No direct access to challenges" on public.kiosk_challenges
  for all using (false);

-- RPC for Dosen to create pairing
create or replace function public.create_kiosk_pairing(p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_code text;
  v_station_id uuid;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role != 'dosen' then
    return json_build_object('success', false, 'error', 'Hanya Dosen yang dapat membuat Kiosk Station');
  end if;

  -- Generate 6 digit random numeric string
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  
  -- Ensure unique code just in case
  while exists (select 1 from public.attendance_stations where pairing_code = v_code) loop
    v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  end loop;

  insert into public.attendance_stations (name, pairing_code, pairing_expires_at, created_by)
  values (p_name, v_code, now() + interval '10 minutes', auth.uid())
  returning id into v_station_id;

  return json_build_object('success', true, 'station_id', v_station_id, 'pairing_code', v_code);
end;
$$;
