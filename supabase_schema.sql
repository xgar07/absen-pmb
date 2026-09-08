-- Buat tabel profiles
create table public.profiles (
  id uuid not null references auth.users on delete cascade,
  full_name text not null,
  role text not null check (role in ('dosen', 'panitia')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (id)
);

-- Aktifkan Row Level Security
alter table public.profiles enable row level security;

-- Policy: User bisa melihat profil semua orang (agar panitia bisa melihat nama panitia lain)
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

-- Policy: User hanya bisa mengupdate profilnya sendiri
create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- Policy: User bisa insert profile miliknya sendiri (dibutuhkan saat register)
create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );
