-- Migration Phase 6: Panitia Soft Delete / Deactivation
alter table public.profiles
add column if not exists is_active boolean not null default true;