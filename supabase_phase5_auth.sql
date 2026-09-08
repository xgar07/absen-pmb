-- 1. Tambah kolom username dan nim ke profiles
alter table public.profiles
add column if not exists username text unique,
add column if not exists nim text;

-- Aktifkan pgcrypto untuk hashing password
create extension if not exists pgcrypto;

-- 2. Fungsi untuk membuat akun panitia
create or replace function public.create_panitia_account(
  p_username text,
  p_password text,
  p_nama text,
  p_nim text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dosen_id uuid;
  v_role text;
  v_user_id uuid;
  v_email text;
  v_encrypted_pw text;
begin
  -- Cek apakah pemanggil terotentikasi dan merupakan dosen
  v_dosen_id := auth.uid();
  if v_dosen_id is null then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;

  select role into v_role from public.profiles where id = v_dosen_id;
  if v_role != 'dosen' then
    return json_build_object('success', false, 'error', 'Forbidden: Hanya dosen yang dapat membuat akun panitia');
  end if;

  -- Validasi input
  if p_username is null or trim(p_username) = '' then
    return json_build_object('success', false, 'error', 'Username wajib diisi');
  end if;

  if p_password is null or length(p_password) < 6 then
    return json_build_object('success', false, 'error', 'Password minimal 6 karakter');
  end if;

  -- Bersihkan username (lowercase, tanpa spasi)
  p_username := lower(trim(p_username));
  p_username := regexp_replace(p_username, '\s+', '', 'g');

  -- Cek duplikasi di profiles
  if exists (select 1 from public.profiles where username = p_username) then
    return json_build_object('success', false, 'error', 'Username sudah digunakan');
  end if;

  -- Buat email dummy untuk login Supabase Auth
  v_email := p_username || '@panitia.pmb.local';

  -- Cek duplikasi di auth.users secara aman
  if exists (select 1 from auth.users where email = v_email) then
    return json_build_object('success', false, 'error', 'Email internal untuk username ini sudah terdaftar');
  end if;

  v_user_id := gen_random_uuid();
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  -- Insert ke auth.users
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    v_user_id, 'authenticated', 'authenticated', v_email, v_encrypted_pw, now(), now(), now(), '', '', '', ''
  );
  
  -- Insert ke auth.identities
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id::text, v_email)::jsonb, 'email', v_user_id::text, now(), now()
  );

  -- Insert ke public.profiles
  insert into public.profiles (id, full_name, role, username, nim)
  values (v_user_id, p_nama, 'panitia', p_username, p_nim);

  return json_build_object('success', true, 'message', 'Akun panitia berhasil dibuat', 'username', p_username);
exception when others then
  return json_build_object('success', false, 'error', sqlerrm);
end;
$$;
grant execute on function public.create_panitia_account(text, text, text, text) to authenticated;

-- 3. Fungsi untuk mereset password panitia
create or replace function public.reset_panitia_password(
  p_username text,
  p_new_password text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dosen_id uuid;
  v_role text;
  v_target_user_id uuid;
  v_email text;
  v_encrypted_pw text;
begin
  -- Cek otorisasi dosen
  v_dosen_id := auth.uid();
  if v_dosen_id is null then
    return json_build_object('success', false, 'error', 'Unauthorized');
  end if;

  select role into v_role from public.profiles where id = v_dosen_id;
  if v_role != 'dosen' then
    return json_build_object('success', false, 'error', 'Forbidden: Hanya dosen yang dapat mereset password');
  end if;

  if p_new_password is null or length(p_new_password) < 6 then
    return json_build_object('success', false, 'error', 'Password minimal 6 karakter');
  end if;

  p_username := lower(trim(p_username));
  v_email := p_username || '@panitia.pmb.local';

  -- Cari user target
  select id into v_target_user_id from auth.users where email = v_email;
  
  if v_target_user_id is null then
    return json_build_object('success', false, 'error', 'Akun panitia tidak ditemukan');
  end if;

  -- Pastikan target benar-benar panitia
  if not exists (select 1 from public.profiles where id = v_target_user_id and role = 'panitia') then
    return json_build_object('success', false, 'error', 'Target bukan panitia');
  end if;

  v_encrypted_pw := crypt(p_new_password, gen_salt('bf'));

  -- Update password
  update auth.users
  set encrypted_password = v_encrypted_pw,
      updated_at = now()
  where id = v_target_user_id;

  return json_build_object('success', true, 'message', 'Password berhasil direset');
exception when others then
  return json_build_object('success', false, 'error', sqlerrm);
end;
$$;
grant execute on function public.reset_panitia_password(text, text) to authenticated;
