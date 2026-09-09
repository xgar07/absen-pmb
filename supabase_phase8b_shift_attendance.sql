-- PHASE 8B: SHIFT-BASED IN / OUT ATTENDANCE

-- 1. Tambahkan kolom untuk Shift dan Tipe Absen (IN / OUT)
alter table public.attendance add column if not exists shift_schedule_id uuid references public.shift_schedules(id) on delete restrict;
alter table public.attendance add column if not exists attendance_type text check (attendance_type is null or attendance_type in ('IN', 'OUT'));

-- 2. Hapus Unique Constraint lama yang membatasi 1 absen per hari
drop index if exists unique_attendance_per_day;

-- 3. Buat Unique Constraint baru (Partial Index) untuk mencegah duplikasi IN dan OUT pada shift yang sama
create unique index if not exists unique_attendance_in on public.attendance(panitia_id, shift_schedule_id) where attendance_type = 'IN';
create unique index if not exists unique_attendance_out on public.attendance(panitia_id, shift_schedule_id) where attendance_type = 'OUT';

-- 4. Replace fungsi submit_attendance dengan State Machine Logic
drop function if exists public.submit_attendance(text);
drop function if exists public.submit_attendance(text, text);

create or replace function public.submit_attendance(qr_token text, p_reason text default null)
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
  v_all_completed boolean := true;
  
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

  -- 3. STATE MACHINE / SHIFT LOGIC
  v_current_date := (now() at time zone 'Asia/Jakarta')::date;
  v_current_time := (now() at time zone 'Asia/Jakarta')::time;
  
  for sched in (
    select ss.id, s.start_time 
    from public.shift_members sm
    join public.shift_schedules ss on sm.schedule_id = ss.id
    join public.shifts s on ss.shift_id = s.id
    where sm.user_id = v_user_id 
      and ss.schedule_date = v_current_date
      and s.is_active = true
    order by s.start_time asc
  ) loop
    v_has_schedules := true;
    
    -- Check attendance states for this schedule
    select exists(select 1 from public.attendance where panitia_id = v_user_id and shift_schedule_id = sched.id and attendance_type = 'IN') into v_in_exists;
    select exists(select 1 from public.attendance where panitia_id = v_user_id and shift_schedule_id = sched.id and attendance_type = 'OUT') into v_out_exists;
    
    if not v_in_exists then
      -- FIX 2: IN TIME VALIDATION (Tidak boleh absen sebelum waktunya)
      if v_current_time < sched.start_time then
        return json_build_object('success', false, 'error', 'EARLY_ATTENDANCE', 'message', 'Belum waktunya shift dimulai');
      end if;

      -- State: Belum IN. Maka aksi saat ini adalah IN.
      v_all_completed := false;
      
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
        values (v_user_id, sched.id, 'IN', 'Hadir', v_late_status, p_reason);
        return json_build_object('success', true, 'message', 'Berhasil Absen MASUK');
      exception when unique_violation then
        return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN MASUK UNTUK SHIFT INI');
      when others then
        return json_build_object('success', false, 'error', 'SERVER_ERROR', 'message', sqlerrm);
      end;
      
    elsif v_in_exists and not v_out_exists then
      -- State: Sudah IN, belum OUT. Maka aksi saat ini adalah OUT.
      v_all_completed := false;
      
      begin
        insert into public.attendance (panitia_id, shift_schedule_id, attendance_type, status, late_status, late_reason)
        values (v_user_id, sched.id, 'OUT', 'Hadir', 'tepat_waktu', null);
        return json_build_object('success', true, 'message', 'Berhasil Absen PULANG');
      exception when unique_violation then
        return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN PULANG UNTUK SHIFT INI');
      when others then
        return json_build_object('success', false, 'error', 'SERVER_ERROR', 'message', sqlerrm);
      end;
      
    end if;
    -- Jika v_in_exists dan v_out_exists (COMPLETED), loop akan berlanjut ke jadwal shift berikutnya (jika ada overlap/dua shift).
    
  end loop;

  if not v_has_schedules then
    return json_build_object('success', false, 'error', 'NO_SHIFT', 'message', 'TIDAK ADA JADWAL SHIFT');
  end if;

  if v_all_completed then
    return json_build_object('success', false, 'error', 'SHIFT_COMPLETED', 'message', 'SHIFT SELESAI');
  end if;
  
  return json_build_object('success', false, 'error', 'UNKNOWN_STATE', 'message', 'Status shift tidak diketahui');
end;
$$;
revoke execute on function public.submit_attendance(text, text) from public;
grant execute on function public.submit_attendance(text, text) to authenticated;

-- Bug 2: RPC for Dosen quick assignment today
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
begin
  -- Authorization
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role != 'dosen' then
    return json_build_object('success', false, 'error', 'Hanya Dosen yang dapat menugaskan shift');
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
revoke execute on function public.assign_panitia_to_shift_today(uuid, uuid) from public;
grant execute on function public.assign_panitia_to_shift_today(uuid, uuid) to authenticated;
