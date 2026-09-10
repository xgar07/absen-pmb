-- Hapus policy shared yang kemarin
drop policy if exists "Dosen dan Panitia full access on tasks" on public.tasks;

-- Dosen: akses penuh ke semua task, tanpa syarat
create policy "Dosen full access on tasks" on public.tasks
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen')
  );

-- Panitia: boleh SELECT semua task (baca semua, termasuk buatan Dosen)
create policy "Panitia select all tasks" on public.tasks
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia' and is_active is not false)
  );

-- Panitia: boleh INSERT task baru, wajib created_by = dirinya sendiri
create policy "Panitia insert own tasks" on public.tasks
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia' and is_active is not false)
    and created_by = auth.uid()
  );

-- Panitia: boleh UPDATE metadata task HANYA jika pembuat task aslinya juga panitia (siapapun)
create policy "Panitia update tasks created by panitia" on public.tasks
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia' and is_active is not false)
    and exists (select 1 from public.profiles creator where creator.id = tasks.created_by and creator.role = 'panitia')
  );

-- Panitia: boleh DELETE HANYA jika pembuat task aslinya juga panitia (siapapun)
create policy "Panitia delete tasks created by panitia" on public.tasks
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia' and is_active is not false)
    and exists (select 1 from public.profiles creator where creator.id = tasks.created_by and creator.role = 'panitia')
  );
