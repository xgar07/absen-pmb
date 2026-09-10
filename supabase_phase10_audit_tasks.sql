-- PHASE 10: Task Audit Log & Soft Delete

-- 1a. Soft delete columns for tasks
alter table public.tasks add column if not exists is_deleted boolean not null default false;
alter table public.tasks add column if not exists deleted_at timestamp with time zone;
alter table public.tasks add column if not exists deleted_by uuid references public.profiles(id);

-- 1b. Table for task audit logs
create table if not exists public.task_audit_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  task_title_snapshot text not null,
  action text not null check (action in ('created', 'edited', 'deleted', 'restored')),
  performed_by uuid references public.profiles(id) not null,
  detail jsonb,
  created_at timestamp with time zone default now()
);

alter table public.task_audit_logs enable row level security;

drop policy if exists "Dosen dan Panitia bisa baca audit log task" on public.task_audit_logs;
create policy "Dosen dan Panitia bisa baca audit log task" on public.task_audit_logs
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('dosen', 'panitia') and is_active is not false)
  );

-- 1c. RPCs for Create, Edit, Delete Task

-- Create
create or replace function public.create_task_logged(p_title text, p_description text, p_deadline date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_new_id uuid;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('dosen', 'panitia') then
    return json_build_object('success', false, 'error', 'Tidak diizinkan');
  end if;

  insert into public.tasks (title, description, deadline, created_by)
  values (p_title, p_description, p_deadline, auth.uid())
  returning id into v_new_id;

  insert into public.task_audit_logs (task_id, task_title_snapshot, action, performed_by)
  values (v_new_id, p_title, 'created', auth.uid());

  return json_build_object('success', true, 'task_id', v_new_id);
end;
$$;
grant execute on function public.create_task_logged(text, text, date) to authenticated;

-- Edit
create or replace function public.edit_task_logged(p_task_id uuid, p_title text, p_description text, p_deadline date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_old record;
  v_is_creator_panitia boolean;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('dosen', 'panitia') then
    return json_build_object('success', false, 'error', 'Tidak diizinkan');
  end if;

  select * into v_old from public.tasks where id = p_task_id and is_deleted = false;
  if v_old is null then
    return json_build_object('success', false, 'error', 'Task tidak ditemukan atau sudah dihapus');
  end if;

  if v_role = 'panitia' then
    select (role = 'panitia') into v_is_creator_panitia from public.profiles where id = v_old.created_by;
    if not coalesce(v_is_creator_panitia, false) then
      return json_build_object('success', false, 'error', 'Anda tidak bisa mengedit task buatan Dosen');
    end if;
  end if;

  update public.tasks set title = p_title, description = p_description, deadline = p_deadline
  where id = p_task_id;

  insert into public.task_audit_logs (task_id, task_title_snapshot, action, performed_by, detail)
  values (p_task_id, p_title, 'edited', auth.uid(), jsonb_build_object(
    'before', jsonb_build_object('title', v_old.title, 'description', v_old.description, 'deadline', v_old.deadline),
    'after', jsonb_build_object('title', p_title, 'description', p_description, 'deadline', p_deadline)
  ));

  return json_build_object('success', true);
end;
$$;
grant execute on function public.edit_task_logged(uuid, text, text, date) to authenticated;

-- Delete
create or replace function public.delete_task_logged(p_task_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_old record;
  v_is_creator_panitia boolean;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('dosen', 'panitia') then
    return json_build_object('success', false, 'error', 'Tidak diizinkan');
  end if;

  select * into v_old from public.tasks where id = p_task_id and is_deleted = false;
  if v_old is null then
    return json_build_object('success', false, 'error', 'Task tidak ditemukan atau sudah dihapus');
  end if;

  if v_role = 'panitia' then
    select (role = 'panitia') into v_is_creator_panitia from public.profiles where id = v_old.created_by;
    if not coalesce(v_is_creator_panitia, false) then
      return json_build_object('success', false, 'error', 'Anda tidak bisa menghapus task buatan Dosen');
    end if;
  end if;

  update public.tasks set is_deleted = true, deleted_at = now(), deleted_by = auth.uid()
  where id = p_task_id;

  insert into public.task_audit_logs (task_id, task_title_snapshot, action, performed_by)
  values (p_task_id, v_old.title, 'deleted', auth.uid());

  return json_build_object('success', true);
end;
$$;
grant execute on function public.delete_task_logged(uuid) to authenticated;
