-- PHASE 8C: FIX OVERLAPPING SHIFTS LOGIC

-- 1. Modify `preview_attendance_action` to return all actionable states
drop function if exists public.preview_attendance_action(text);

create or replace function public.preview_attendance_action(qr_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret constant text := 'SANGAT_RAHASIA_UBAH_DI_PROD_12345';
  v_user_id uuid;
  v_role text;
  v_parts text[];
  v_payload_b64 text;
  v_signature text;
  v_payload_json json;
  v_token_window bigint;
  v_expected_signature text;
  v_current_window bigint;
  v_current_time time;
  v_current_date date;
  
  sched record;
  v_has_schedules boolean := false;
  v_in_exists boolean;
  v_out_exists boolean;
  
  v_actions jsonb := '[]'::jsonb;
  v_is_early boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'Anda harus login');
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null or v_role != 'panitia' then
    return json_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'Hanya panitia yang dapat melakukan absensi');
  end if;

  v_parts := string_to_array(qr_token, '.');
  if array_length(v_parts, 1) != 2 then
    return json_build_object('success', false, 'error', 'INVALID_FORMAT', 'message', 'QR TIDAK VALID');
  end if;

  v_payload_b64 := v_parts[1];
  v_signature := v_parts[2];

  begin
    v_payload_json := convert_from(decode(v_payload_b64, 'base64'), 'utf8')::json;
    v_token_window := (v_payload_json->>'window')::bigint;
  exception when others then
    return json_build_object('success', false, 'error', 'INVALID_PAYLOAD', 'message', 'QR TIDAK VALID');
  end;

  v_expected_signature := encode(hmac(decode(v_payload_b64, 'base64'), convert_to(v_secret, 'utf8'), 'sha256'), 'base64');
  if v_signature != v_expected_signature then
    return json_build_object('success', false, 'error', 'INVALID_SIGNATURE', 'message', 'QR TIDAK VALID');
  end if;

  v_current_window := floor(extract(epoch from now()) / 60)::bigint;
  if v_current_window < v_token_window then
    return json_build_object('success', false, 'error', 'FUTURE_TOKEN', 'message', 'QR BELUM AKTIF');
  elsif v_current_window > v_token_window + 1 then
    return json_build_object('success', false, 'error', 'EXPIRED_TOKEN', 'message', 'QR KADALUARSA');
  end if;

  v_current_date := (now() at time zone 'Asia/Jakarta')::date;
  v_current_time := (now() at time zone 'Asia/Jakarta')::time;

  for sched in (
    select ss.id, s.name as shift_name, s.start_time, s.end_time
    from public.shift_members sm
    join public.shift_schedules ss on sm.schedule_id = ss.id
    join public.shifts s on ss.shift_id = s.id
    where sm.user_id = v_user_id and ss.schedule_date = v_current_date and s.is_active = true
    order by s.start_time asc
  ) loop
    v_has_schedules := true;
    select exists(select 1 from public.attendance where panitia_id = v_user_id and shift_schedule_id = sched.id and attendance_type = 'IN') into v_in_exists;
    select exists(select 1 from public.attendance where panitia_id = v_user_id and shift_schedule_id = sched.id and attendance_type = 'OUT') into v_out_exists;

    if not v_in_exists then
      -- IN is allowed only if current_time >= start_time
      if v_current_time >= sched.start_time then
        v_actions := v_actions || jsonb_build_object(
          'action', 'IN',
          'shift_id', sched.id,
          'shift_name', sched.shift_name,
          'start_time', sched.start_time,
          'end_time', sched.end_time,
          'is_early_checkout', false
        );
      end if;
    elsif v_in_exists and not v_out_exists then
      -- OUT is allowed regardless of current_time relative to end_time
      v_is_early := (v_current_time < sched.end_time);
      v_actions := v_actions || jsonb_build_object(
        'action', 'OUT',
        'shift_id', sched.id,
        'shift_name', sched.shift_name,
        'start_time', sched.start_time,
        'end_time', sched.end_time,
        'is_early_checkout', v_is_early
      );
    end if;
  end loop;

  if not v_has_schedules then
    return json_build_object('success', false, 'error', 'NO_SHIFT', 'message', 'TIDAK ADA JADWAL SHIFT');
  end if;

  if jsonb_array_length(v_actions) > 0 then
    return json_build_object('success', true, 'actions', v_actions);
  end if;

  -- If we reach here, it means schedules exist, but no actionable states were found.
  -- Either all are completed, or some haven't started yet.
  return json_build_object('success', false, 'error', 'NOT_ACTIONABLE', 'message', 'Belum waktunya absen untuk shift Anda atau semua shift telah selesai.');
end;
$$;
grant execute on function public.preview_attendance_action(text) to authenticated;

-- 2. Modify `submit_attendance` to accept specific shift and action
drop function if exists public.submit_attendance(text, text);

create or replace function public.submit_attendance(qr_token text, p_shift_id uuid, p_action text, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret constant text := 'SANGAT_RAHASIA_UBAH_DI_PROD_12345';
  v_user_id uuid;
  v_role text;
  v_parts text[];
  v_payload_b64 text;
  v_signature text;
  v_payload_json json;
  v_token_window bigint;
  v_expected_signature text;
  v_current_window bigint;
  
  v_current_time time;
  v_current_date date;
  
  sched record;
  v_in_exists boolean;
  v_out_exists boolean;
  v_late_status text;
begin
  -- 1. AUTH & ROLE CHECK
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'Anda harus login');
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null or v_role != 'panitia' then
    return json_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'Hanya panitia yang dapat melakukan absensi');
  end if;

  -- 2. QR VALIDATION
  v_parts := string_to_array(qr_token, '.');
  if array_length(v_parts, 1) != 2 then
    return json_build_object('success', false, 'error', 'INVALID_FORMAT', 'message', 'Format QR tidak valid');
  end if;

  v_payload_b64 := v_parts[1];
  v_signature := v_parts[2];

  begin
    v_payload_json := convert_from(decode(v_payload_b64, 'base64'), 'utf8')::json;
    v_token_window := (v_payload_json->>'window')::bigint;
  exception when others then
    return json_build_object('success', false, 'error', 'INVALID_PAYLOAD', 'message', 'QR TIDAK VALID');
  end;

  v_expected_signature := encode(hmac(decode(v_payload_b64, 'base64'), convert_to(v_secret, 'utf8'), 'sha256'), 'base64');
  if v_signature != v_expected_signature then
    return json_build_object('success', false, 'error', 'INVALID_SIGNATURE', 'message', 'QR TIDAK VALID');
  end if;

  v_current_window := floor(extract(epoch from now()) / 60)::bigint;
  if v_current_window < v_token_window then
    return json_build_object('success', false, 'error', 'FUTURE_TOKEN', 'message', 'QR BELUM AKTIF');
  elsif v_current_window > v_token_window + 1 then
    return json_build_object('success', false, 'error', 'EXPIRED_TOKEN', 'message', 'QR KADALUARSA');
  end if;

  -- 3. SPECIFIC SHIFT VALIDATION
  v_current_date := (now() at time zone 'Asia/Jakarta')::date;
  v_current_time := (now() at time zone 'Asia/Jakarta')::time;
  
  select ss.id, s.start_time, s.end_time
  into sched
  from public.shift_members sm
  join public.shift_schedules ss on sm.schedule_id = ss.id
  join public.shifts s on ss.shift_id = s.id
  where sm.user_id = v_user_id 
    and ss.id = p_shift_id
    and ss.schedule_date = v_current_date
    and s.is_active = true;

  if not found then
    return json_build_object('success', false, 'error', 'NO_SHIFT', 'message', 'Jadwal shift tidak ditemukan atau tidak valid.');
  end if;

  -- Check current attendance states for this specific schedule
  select exists(select 1 from public.attendance where panitia_id = v_user_id and shift_schedule_id = p_shift_id and attendance_type = 'IN') into v_in_exists;
  select exists(select 1 from public.attendance where panitia_id = v_user_id and shift_schedule_id = p_shift_id and attendance_type = 'OUT') into v_out_exists;

  -- ACTION: IN
  if p_action = 'IN' then
    if v_in_exists then
      return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN MASUK UNTUK SHIFT INI');
    end if;

    if v_current_time < sched.start_time then
      return json_build_object('success', false, 'error', 'EARLY_ATTENDANCE', 'message', 'Belum waktunya shift dimulai');
    end if;

    -- Late Logic
    if v_current_time > sched.start_time + interval '30 minutes' then
      if p_reason is null or trim(p_reason) = '' then
        return json_build_object('success', false, 'error', 'LATE_REASON_REQUIRED', 'message', 'Anda terlambat >30 menit, mohon isi keterangan');
      end if;
      v_late_status := 'terlambat';
    else
      v_late_status := 'tepat_waktu';
    end if;

    begin
      insert into public.attendance (panitia_id, shift_schedule_id, attendance_type, status, late_status, late_reason)
      values (v_user_id, p_shift_id, 'IN', 'Hadir', v_late_status, p_reason);
      return json_build_object('success', true, 'message', 'Berhasil Absen MASUK');
    exception when unique_violation then
      return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN MASUK UNTUK SHIFT INI');
    when others then
      return json_build_object('success', false, 'error', 'SERVER_ERROR', 'message', sqlerrm);
    end;

  -- ACTION: OUT
  elsif p_action = 'OUT' then
    if not v_in_exists then
      return json_build_object('success', false, 'error', 'MISSING_IN', 'message', 'ANDA BELUM ABSEN MASUK UNTUK SHIFT INI');
    end if;
    if v_out_exists then
      return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN PULANG UNTUK SHIFT INI');
    end if;

    -- VALIDASI PULANG CEPAT
    if v_current_time < sched.end_time then
      if p_reason is null or trim(p_reason) = '' then
        return json_build_object('success', false, 'error', 'EARLY_CHECKOUT_REASON_REQUIRED', 'message', 'Anda pulang sebelum jam shift berakhir, mohon isi alasan');
      end if;
      begin
        insert into public.attendance (panitia_id, shift_schedule_id, attendance_type, status, late_status, early_checkout_reason)
        values (v_user_id, p_shift_id, 'OUT', 'Hadir', 'tepat_waktu', p_reason);
        return json_build_object('success', true, 'message', 'Berhasil Absen PULANG (Lebih Awal)');
      exception when unique_violation then
        return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN PULANG UNTUK SHIFT INI');
      end;
    end if;

    -- OUT normal (setelah jam shift berakhir)
    begin
      insert into public.attendance (panitia_id, shift_schedule_id, attendance_type, status, late_status)
      values (v_user_id, p_shift_id, 'OUT', 'Hadir', 'tepat_waktu');
      return json_build_object('success', true, 'message', 'Berhasil Absen PULANG');
    exception when unique_violation then
      return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN PULANG UNTUK SHIFT INI');
    when others then
      return json_build_object('success', false, 'error', 'SERVER_ERROR', 'message', sqlerrm);
    end;
  
  else
    return json_build_object('success', false, 'error', 'INVALID_ACTION', 'message', 'Aksi absensi tidak valid.');
  end if;

end;
$$;
grant execute on function public.submit_attendance(text, uuid, text, text) to authenticated;
