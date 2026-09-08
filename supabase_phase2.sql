-- 1. Pastikan ekstensi pgcrypto tersedia untuk hashing (HMAC-SHA256)
create extension if not exists pgcrypto;

-- 2. Buat tabel attendance (jika belum)
create table if not exists public.attendance (
  id uuid not null default gen_random_uuid() primary key,
  panitia_id uuid not null references public.profiles(id) on delete cascade,
  waktu_absen timestamp with time zone not null default timezone('utc'::text, now()),
  status text not null default 'Hadir'
);

-- 3. Unique Expression Index (1 Panitia = 1 Absen per Hari di Waktu Indonesia)
-- Gunakan drop index if exists agar aman dijalankan ulang
drop index if exists unique_attendance_per_day;
create unique index unique_attendance_per_day 
  on public.attendance (panitia_id, (date(waktu_absen at time zone 'Asia/Jakarta')));

-- 4. Aktifkan RLS
alter table public.attendance enable row level security;

-- Policy: Panitia hanya bisa membaca data absennya sendiri
drop policy if exists "Panitia can view own attendance" on public.attendance;
create policy "Panitia can view own attendance"
  on public.attendance for select
  using ( auth.uid() = panitia_id );

-- Policy: Dosen bisa membaca seluruh data absen
drop policy if exists "Dosen can view all attendance" on public.attendance;
create policy "Dosen can view all attendance"
  on public.attendance for select
  using ( 
    exists (
      select 1 from public.profiles 
      where id = auth.uid() and role = 'dosen'
    )
  );

-- 5. RPC: get_kiosk_tokens (Akses Publik)
create or replace function public.get_kiosk_tokens(batch_size int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret constant text := 'SANGAT_RAHASIA_UBAH_DI_PROD_12345';
  v_batch int;
  v_current_window bigint;
  v_window bigint;
  v_payload text;
  v_signature text;
  v_token text;
  v_result jsonb := '[]'::jsonb;
  v_elem jsonb;
begin
  if batch_size < 1 then
    v_batch := 1;
  elsif batch_size > 10 then
    v_batch := 10;
  else
    v_batch := batch_size;
  end if;

  v_current_window := floor(extract(epoch from now()) / 60)::bigint;

  for i in 0..(v_batch - 1) loop
    v_window := v_current_window + i;
    v_payload := '{"v":1,"window":' || v_window::text || '}';
    
    -- Menggunakan convert_to untuk mengubah text ke bytea (mencegah error "cannot cast type text to bytea")
    v_signature := encode(hmac(convert_to(v_payload, 'utf8'), convert_to(v_secret, 'utf8'), 'sha256'), 'base64');
    
    v_token := encode(convert_to(v_payload, 'utf8'), 'base64') || '.' || v_signature;
    
    v_elem := jsonb_build_object('token', v_token, 'window', v_window);
    
    -- Menambahkan element ke array jsonb
    v_result := v_result || v_elem;
  end loop;

  return v_result::json;
end;
$$;

grant execute on function public.get_kiosk_tokens(int) to anon, authenticated;

-- 6. RPC: submit_attendance (Akses Authenticated)
create or replace function public.submit_attendance(qr_token text)
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

  -- Memvalidasi signature dengan me-decode payload b64 langsung ke bytea
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

  begin
    insert into public.attendance (panitia_id, status)
    values (v_user_id, 'Hadir');
    return json_build_object('success', true, 'message', 'Absensi berhasil');
  exception when unique_violation then
    return json_build_object('success', false, 'error', 'DUPLICATE', 'message', 'ANDA SUDAH ABSEN');
  when others then
    return json_build_object('success', false, 'error', 'SERVER_ERROR', 'message', sqlerrm);
  end;

end;
$$;

revoke execute on function public.submit_attendance(text) from public, anon;
grant execute on function public.submit_attendance(text) to authenticated;
