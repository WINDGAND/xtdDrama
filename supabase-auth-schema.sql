-- Supabase Auth + 作品归属（游客可浏览，登录后创作）
-- 在 Supabase 控制台 SQL Editor 执行一次即可。

create extension if not exists "pgcrypto";

-- 1) posts 增加 user_id（归属到 auth.users）
alter table public.posts
add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists posts_user_id_created_at_idx
  on public.posts (user_id, created_at desc);

-- 2) profiles（用户资料：昵称、头像）
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

-- 3) RLS
alter table public.posts enable row level security;
alter table public.profiles enable row level security;

-- posts：游客可浏览（select），写入/修改/删除仅本人
drop policy if exists "posts_select_public" on public.posts;
create policy "posts_select_public" on public.posts
  for select using (true);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
  for update using (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
  for delete using (auth.uid() = user_id);

-- profiles：公开读取（可用于展示头像昵称），仅本人可写
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

