-- PHASE 11: PENGATURAN MINGGU SERAGAM

create table if not exists public.dress_code_settings (
    id uuid primary key default gen_random_uuid(),
    year integer not null,
    month integer not null,
    first_week_type text not null check (first_week_type in ('GANJIL', 'GENAP')),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique(year, month)
);

alter table public.dress_code_settings enable row level security;

-- Dosen full access
create policy "Dosen full access on dress_code_settings" on public.dress_code_settings
    for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'dosen'));

-- Panitia read only
create policy "Panitia read access on dress_code_settings" on public.dress_code_settings
    for select using (exists (select 1 from public.profiles where id = auth.uid() and role = 'panitia'));
