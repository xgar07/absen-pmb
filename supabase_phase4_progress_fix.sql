-- PRIORITY 4 FIX: Shared Task Progress Accumulation

-- 1. Tambahkan kolom total_progress_percent
alter table public.task_progress_logs
add column if not exists total_progress_percent int default 0;

-- 2. Migrasi Data Lama
-- Agar log yang sebelumnya menyimpan absolute value berubah menjadi akumulatif:
-- Pada awalnya, input dari user di log adalah absolute value, tetapi karena sekarang log akan menyimpan nilai delta (progress_percent) dan totalnya (total_progress_percent).
-- Namun user berkata: "Contoh kasus nyata: Panitia A input progress 45%, lalu Panitia B input 15% sebagai kontribusi tambahannya — tapi yang tersimpan/tertampil di card malah 15% (progress justru terlihat mundur dari 45% ke 15%)."
-- Ini berarti Panitia B sebenarnya menginput "15" (dengan asumsi 15% adalah kontribusinya), jadi `progress_percent` yang sudah tersimpan di database adalah benar-benar "kontribusi" mereka.
-- Oleh karena itu, kita tinggal menghitung ulang sum-nya!

do $$
declare
  r record;
  v_running_total int;
  v_last_task_id uuid;
begin
  v_last_task_id := null;
  v_running_total := 0;
  
  -- Iterasi seluruh log berdasarkan task_id dan waktu dibuat
  for r in (
    select id, task_id, progress_percent 
    from public.task_progress_logs 
    order by task_id, created_at asc
  ) loop
    if v_last_task_id is null or v_last_task_id != r.task_id then
      v_running_total := 0;
      v_last_task_id := r.task_id;
    end if;
    
    v_running_total := v_running_total + r.progress_percent;
    if v_running_total > 100 then
      v_running_total := 100;
    end if;
    
    update public.task_progress_logs 
    set total_progress_percent = v_running_total 
    where id = r.id;
  end loop;

  -- 3. Update tabel tasks
  -- Menyesuaikan progress_percent di tabel tasks dengan log terakhir
  for r in (
    select task_id, max(total_progress_percent) as max_prog 
    from public.task_progress_logs 
    group by task_id
  ) loop
    update public.tasks
    set progress_percent = r.max_prog,
        status = case 
                   when r.max_prog = 100 then 'completed'
                   when r.max_prog > 0 then 'in_progress'
                   else 'todo'
                 end
    where id = r.task_id;
  end loop;
end;
$$;

-- 4. Re-create add_task_progress RPC
drop function if exists public.add_task_progress(uuid, int, text);

create or replace function public.add_task_progress(p_task_id uuid, p_contribution int, p_report text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_prev_status text;
  v_new_status text;
  v_current_progress int;
  v_new_progress int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'Anda harus login');
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null or v_role != 'panitia' then
    return json_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'Hanya panitia yang dapat melaporkan tugas');
  end if;
  
  if p_contribution <= 0 then
    return json_build_object('success', false, 'error', 'INVALID_PROGRESS', 'message', 'Kontribusi harus lebih dari 0');
  end if;

  select status, coalesce(progress_percent, 0) 
  into v_prev_status, v_current_progress 
  from public.tasks 
  where id = p_task_id;
  
  if v_prev_status is null then
    return json_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Task tidak ditemukan');
  end if;

  v_new_progress := v_current_progress + p_contribution;

  if v_new_progress > 100 then
    return json_build_object('success', false, 'error', 'EXCEEDS_100', 'message', 'Sisa progress task ini hanya ' || (100 - v_current_progress)::text || '%, masukkan maksimal itu.');
  end if;

  if v_new_progress = 100 then
    v_new_status := 'completed';
  elsif v_new_progress > 0 then
    v_new_status := 'in_progress';
  else
    v_new_status := 'todo';
  end if;

  -- Insert log (progress_percent menyimpan delta/kontribusi, total_progress_percent menyimpan nilai setelah ditambahkan)
  insert into public.task_progress_logs (task_id, user_id, progress_percent, total_progress_percent, report, previous_status, new_status)
  values (p_task_id, v_user_id, p_contribution, v_new_progress, p_report, v_prev_status, v_new_status);

  -- Update task
  update public.tasks
  set progress_percent = v_new_progress,
      status = v_new_status,
      last_updated_by = v_user_id,
      updated_at = timezone('utc'::text, now())
  where id = p_task_id;

  return json_build_object('success', true, 'message', 'Progress berhasil ditambahkan');
end;
$$;
grant execute on function public.add_task_progress(uuid, int, text) to authenticated;
