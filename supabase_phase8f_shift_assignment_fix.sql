-- PHASE 8F: FIX TEMPORAL VALIDATION FOR QUICK ASSIGN SHIFT
-- Menolak penambahan panitia ke shift yang sudah lewat end_time pada hari ini.

create or replace function public.assign_panitia_to_shift_today(p_shift_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_schedule_id uuid;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_current_time time := (now() at time zone 'Asia/Jakarta')::time;
  v_shift_end_time time;
  v_shift_name text;
begin
  -- Authorization
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role != 'dosen' then
    return json_build_object('success', false, 'error', 'Hanya Dosen yang dapat menugaskan shift');
  end if;

  select end_time, name into v_shift_end_time, v_shift_name from public.shifts where id = p_shift_id;
  if not found then
    return json_build_object('success', false, 'error', 'Shift tidak ditemukan');
  end if;

  if v_current_time >= v_shift_end_time then
    return json_build_object(
      'success', false, 
      'error', 'Shift ' || v_shift_name || ' hari ini sudah berakhir pada ' || to_char(v_shift_end_time, 'HH24:MI') || '. Panitia tidak dapat ditambahkan ke shift ini.'
    );
  end if;

  -- Cari atau buat schedule untuk shift ini hari ini
  select id into v_schedule_id 
  from public.shift_schedules 
  where shift_id = p_shift_id and schedule_date = v_today;

  if v_schedule_id is null then
    insert into public.shift_schedules (shift_id, schedule_date, created_by)
    values (p_shift_id, v_today, auth.uid())
    returning id into v_schedule_id;
  end if;

  -- Tambahkan member (idempotent)
  insert into public.shift_members (schedule_id, user_id)
  values (v_schedule_id, p_user_id)
  on conflict (schedule_id, user_id) do nothing;

  return json_build_object('success', true, 'message', 'Berhasil ditambahkan ke shift hari ini', 'schedule_id', v_schedule_id);
end;
$$;
