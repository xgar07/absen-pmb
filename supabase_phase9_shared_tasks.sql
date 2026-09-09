-- PHASE 9: SHARED TASKS (PANITIA CAN CREATE/EDIT/DELETE TASKS)

-- 1. Drop existing Dosen-only policies on tasks
drop policy if exists "Dosen can Insert tasks" on public.tasks;
drop policy if exists "Dosen can Select their tasks" on public.tasks;
drop policy if exists "Dosen can Update their tasks" on public.tasks;
drop policy if exists "Dosen can Delete their tasks" on public.tasks;

-- Drop Panitia select-only policy on tasks (if any)
drop policy if exists "Panitia can Select all tasks" on public.tasks;

-- 2. Create new unified policy for both Dosen and Panitia
create policy "Dosen dan Panitia full access on tasks" on public.tasks
  for all using (
    exists (
      select 1 from public.profiles 
      where id = auth.uid() 
      and role in ('dosen', 'panitia')
      and is_active is not false
    )
  );

-- Note: The column created_by was already created in phase 4.
