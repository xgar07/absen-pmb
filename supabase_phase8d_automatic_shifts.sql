-- PHASE 8D: AUTOMATIC DAILY SHIFT CREATION (PAGI & SIANG)

create or replace function public.create_daily_shifts(p_schedule_date date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_pagi_id uuid;
  v_siang_id uuid;
  v_existing_count int;
begin
  -- 1. Authorization: Only Dosen can create schedules
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role != 'dosen' then
    return json_build_object('success', false, 'error', 'Hanya Dosen yang dapat membuat jadwal shift');
  end if;

  -- 2. Legacy / Duplicate Protection
  -- If any schedule exists for this date (either full or partial), block creation.
  select count(*) into v_existing_count from public.shift_schedules where schedule_date = p_schedule_date;
  if v_existing_count > 0 then
    return json_build_object('success', false, 'error', 'Jadwal untuk tanggal ini sudah tersedia.');
  end if;

  -- 3. Retrieve Shift Templates
  -- Assumes exact names based on Phase 8A seed ('Pagi' and 'Siang')
  select id into v_pagi_id from public.shifts where name ilike '%Pagi%' limit 1;
  select id into v_siang_id from public.shifts where name ilike '%Siang%' limit 1;

  if v_pagi_id is null or v_siang_id is null then
    return json_build_object('success', false, 'error', 'Data master shift (Pagi/Siang) tidak ditemukan di database.');
  end if;

  -- 4. Atomic Creation
  -- Both records are inserted in a single statement. If one fails, the transaction rolls back.
  insert into public.shift_schedules (shift_id, schedule_date, created_by)
  values 
    (v_pagi_id, p_schedule_date, auth.uid()),
    (v_siang_id, p_schedule_date, auth.uid());

  return json_build_object('success', true, 'message', 'Jadwal Shift Pagi dan Siang berhasil dibuat secara otomatis');
  
exception 
  when unique_violation then
    return json_build_object('success', false, 'error', 'Jadwal untuk tanggal ini sudah tersedia.');
  when others then
    return json_build_object('success', false, 'error', sqlerrm);
end;
$$;
