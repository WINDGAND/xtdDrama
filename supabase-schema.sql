-- xtd-drama 最小闭环表结构（用于：发布到广场 → 广场列表 → 作品详情）
-- 在 Supabase 控制台 SQL Editor 执行一次即可。
-- 注意：本项目目前使用 service_role key 进行服务端写入（见 src/lib/supabase-server.ts）。

create extension if not exists "pgcrypto";

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  mode text not null check (mode in ('image','video')),
  style text not null,
  result_url text not null,

  main_entity text,
  scene_state text,
  user_emotion text
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);

-- NPC 人设表（最小可用：3 个角色）
create table if not exists public.npc_profiles (
  id text primary key,
  display_name text not null,
  tone text not null,
  avatar_seed text
);

-- 评论表（用于：详情页 NPC 秒评闭环）
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id uuid not null references public.posts(id) on delete cascade,

  author_type text not null check (author_type in ('npc','user')),
  npc_id text references public.npc_profiles(id),
  display_name text,

  content text not null,
  status text not null default 'ready' check (status in ('ready','placeholder'))
);

create index if not exists comments_post_id_created_at_idx
  on public.comments (post_id, created_at asc);

-- 初始化 NPC（可重复执行，冲突则忽略）
insert into public.npc_profiles (id, display_name, tone, avatar_seed) values
  ('senior', '毒舌学长', '嘴硬心软、犀利吐槽但不冒犯', 'S'),
  ('cheer', '捧场王', '无脑捧场、夸夸群群主', 'C'),
  ('sis', '知心学姐', '温柔共情、给情绪兜底', 'A')
on conflict (id) do nothing;

