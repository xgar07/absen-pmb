-- PRIORITY 2 & 3: Model Penugasan Shared & Audit Log Lengkap

alter table public.tasks
add column if not exists last_updated_by uuid references public.profiles(id);

alter table public.task_progress_logs
add column if not exists previous_status text,
add column if not exists new_status text;

-- Hapus RPC claim_task karena task kini shared
drop function if exists public.claim_task(uuid);

-- Update RPC add_task_progress untuk menghilangkan batasan PIC & mencatat riwayat status
create or replace function public.add_task_progress(p_task_id uuid, p_progress int, p_report text)
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
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'Anda harus login');
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null or v_role != 'panitia' then
    return json_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'Hanya panitia yang dapat melaporkan tugas');
  end if;
  
  if p_progress < 0 or p_progress > 100 then
    return json_build_object('success', false, 'error', 'INVALID_PROGRESS', 'message', 'Progress harus antara 0 hingga 100');
  end if;

  select status into v_prev_status from public.tasks where id = p_task_id;
  if v_prev_status is null then
    return json_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Task tidak ditemukan');
  end if;

  if p_progress = 100 then
    v_new_status := 'completed';
  elsif p_progress > 0 then
    v_new_status := 'in_progress';
  else
    v_new_status := 'todo';
  end if;

  -- 1. Insert log
  insert into public.task_progress_logs (task_id, user_id, progress_percent, report, previous_status, new_status)
  values (p_task_id, v_user_id, p_progress, p_report, v_prev_status, v_new_status);

  -- 2. Update task
  update public.tasks
  set progress_percent = p_progress,
      status = v_new_status,
      last_updated_by = v_user_id,
      updated_at = timezone('utc'::text, now())
  where id = p_task_id;

  return json_build_object('success', true, 'message', 'Progress berhasil disimpan');
end;
$$;
grant execute on function public.add_task_progress(uuid, int, text) to authenticated;
