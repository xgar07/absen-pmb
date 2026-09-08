-- PRIORITY 1: Tepat Waktu vs Terlambat

create table if not exists public.system_settings (
  id int primary key default 1,
  shift_start_time time not null default '08:00:00'
);

-- Insert default if not exists
insert into public.system_settings (id, shift_start_time) values (1, '08:00:00') on conflict do nothing;

alter table public.system_settings enable row level security;
drop policy if exists "All can read system_settings" on public.system_settings;
create policy "All can read system_settings" on public.system_settings for select using (true);
drop policy if exists "Dosen can update system_settings" on public.system_settings;
create policy "Dosen can update system_settings" on public.system_settings for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
);

alter table public.attendance
add column if not exists late_status text check (late_status in ('tepat_waktu', 'terlambat')),
add column if not exists late_reason text;

-- Drop old function because we are changing arguments
drop function if exists public.submit_attendance(text);

create or replace function public.submit_attendance(qr_token text, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public
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
  
  v_shift_start time;
  v_current_time time;
  v_late_status text;
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

  -- LATE LOGIC
  select shift_start_time into v_shift_start from public.system_settings where id = 1;
  if v_shift_start is null then v_shift_start := '08:00:00'::time; end if;
  v_current_time := (now() at time zone 'Asia/Jakarta')::time;
  
  if v_current_time > v_shift_start + interval '30 minutes' then
    if p_reason is null or trim(p_reason) = '' then
      return json_build_object('success', false, 'error', 'LATE_REASON_REQUIRED', 'message', 'Anda terlambat >30 menit, mohon isi keterangan');
    end if;
    v_late_status := 'terlambat';
  else
    v_late_status := 'tepat_waktu';
  end if;

  begin
    insert into public.attendance (panitia_id, status, late_status, late_reason)
    values (v_user_id, 'Hadir', v_late_status, p_reason);
    return json_build_object('success', true, 'message', 'Absensi berhasil');
  exception when unique_violation then
    return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN');
  when others then
    return json_build_object('success', false, 'error', 'SERVER_ERROR', 'message', sqlerrm);
  end;
end;
$$;
grant execute on function public.submit_attendance(text, text) to authenticated;
