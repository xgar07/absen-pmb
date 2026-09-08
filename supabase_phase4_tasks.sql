-- 1. Buat tabel tasks
create table if not exists public.tasks (
  id uuid not null default gen_random_uuid() primary key,
  title text not null,
  description text,
  deadline date not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'completed')),
  progress_percent int not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  current_pic_id uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- 2. Buat tabel task_progress_logs
create table if not exists public.task_progress_logs (
  id uuid not null default gen_random_uuid() primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress_percent int not null check (progress_percent >= 0 and progress_percent <= 100),
  report text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- 3. Aktifkan RLS
alter table public.tasks enable row level security;
alter table public.task_progress_logs enable row level security;

-- 4. RLS tasks (Dosen CRUD, Panitia SELECT only)
drop policy if exists "Dosen can Insert tasks" on public.tasks;
create policy "Dosen can Insert tasks"
  on public.tasks for insert
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
  );

drop policy if exists "Dosen can Select their tasks" on public.tasks;
create policy "Dosen can Select their tasks"
  on public.tasks for select
  using (
    created_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
  );

drop policy if exists "Dosen can Update their tasks" on public.tasks;
create policy "Dosen can Update their tasks"
  on public.tasks for update
  using (
    created_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
  );

drop policy if exists "Dosen can Delete their tasks" on public.tasks;
create policy "Dosen can Delete their tasks"
  on public.tasks for delete
  using (
    created_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
  );

drop policy if exists "Panitia can Select all tasks" on public.tasks;
create policy "Panitia can Select all tasks"
  on public.tasks for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia')
  );

-- 5. RLS task_progress_logs (Dosen SELECT, Panitia SELECT. No direct INSERT)
drop policy if exists "Dosen can Select progress logs" on public.task_progress_logs;
create policy "Dosen can Select progress logs"
  on public.task_progress_logs for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
  );

drop policy if exists "Panitia can Select progress logs" on public.task_progress_logs;
create policy "Panitia can Select progress logs"
  on public.task_progress_logs for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia')
  );

-- 6. RPC: claim_task
create or replace function public.claim_task(p_task_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_task_exists boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'Anda harus login');
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null or v_role != 'panitia' then
    return json_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'Hanya panitia yang dapat mengambil tugas');
  end if;

  select exists (select 1 from public.tasks where id = p_task_id) into v_task_exists;
  if not v_task_exists then
    return json_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Task tidak ditemukan');
  end if;

  update public.tasks
  set current_pic_id = v_user_id, updated_at = timezone('utc'::text, now())
  where id = p_task_id;

  return json_build_object('success', true, 'message', 'Tugas berhasil diambil');
end;
$$;
grant execute on function public.claim_task(uuid) to authenticated;

-- 7. RPC: add_task_progress
create or replace function public.add_task_progress(p_task_id uuid, p_progress int, p_report text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_current_pic uuid;
  v_status text;
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

  select current_pic_id into v_current_pic from public.tasks where id = p_task_id;
  if v_current_pic is null or v_current_pic != v_user_id then
    return json_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'Anda bukan PIC aktif untuk tugas ini');
  end if;

  if p_progress = 100 then
    v_status := 'completed';
  elsif p_progress > 0 then
    v_status := 'in_progress';
  else
    v_status := 'todo';
  end if;

  -- 1. Insert log
  insert into public.task_progress_logs (task_id, user_id, progress_percent, report)
  values (p_task_id, v_user_id, p_progress, p_report);

  -- 2. Update task
  update public.tasks
  set progress_percent = p_progress,
      status = v_status,
      updated_at = timezone('utc'::text, now())
  where id = p_task_id;

  return json_build_object('success', true, 'message', 'Progress berhasil disimpan');
end;
$$;
grant execute on function public.add_task_progress(uuid, int, text) to authenticated;
