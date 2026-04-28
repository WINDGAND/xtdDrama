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

-- NPC 人设表（可用：5 个角色）
create table if not exists public.npc_profiles (
  id text primary key,
  display_name text not null,
  tone text not null,
  avatar_seed text
);

-- 点赞表（用于：作品详情/广场的“朋友圈式”点赞）
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id uuid not null references public.posts(id) on delete cascade,

  actor_type text not null check (actor_type in ('npc','user')),
  user_id uuid,
  npc_id text references public.npc_profiles(id),
  display_name text
);

-- 兼容旧库：post_likes 已存在但缺少 user_id
alter table public.post_likes
  add column if not exists user_id uuid;

create unique index if not exists post_likes_unique_npc_idx
  on public.post_likes (post_id, actor_type, npc_id)
  where actor_type = 'npc';

create unique index if not exists post_likes_unique_user_idx
  on public.post_likes (post_id, actor_type, user_id)
  where actor_type = 'user';

create index if not exists post_likes_post_id_created_at_idx
  on public.post_likes (post_id, created_at asc);

-- 评论表（用于：详情页 NPC 秒评闭环）
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id uuid not null references public.posts(id) on delete cascade,

  author_type text not null check (author_type in ('npc','user')),
  user_id uuid,
  npc_id text references public.npc_profiles(id),
  display_name text,

  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  status text not null default 'ready' check (status in ('ready','placeholder'))
);

-- 兼容旧库：comments 已存在但缺少 user_id/parent_id
alter table public.comments
  add column if not exists user_id uuid;
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_post_id_created_at_idx
  on public.comments (post_id, created_at asc);

create index if not exists comments_post_id_parent_id_idx
  on public.comments (post_id, parent_id, created_at asc);

-- 初始化 NPC（可重复执行，冲突则忽略）
insert into public.npc_profiles (id, display_name, tone, avatar_seed) values
  ('emma', 'Emma', '冷幽默、短句、轻松不夸张，像朋友随口吐槽', 'E'),
  ('liam', 'Liam', '理性克制、偶尔抖机灵，偏观察与总结，不说教', 'L'),
  ('olivia', 'Olivia', '温柔共情、给情绪兜底，语气轻但不鸡汤', 'O'),
  ('noah', 'Noah', '真诚直给、轻微玩梗但不尬，像同事/同学', 'N'),
  ('sophia', 'Sophia', '审美视角、关注细节与氛围，夸也克制，像会拍照的人', 'S')
on conflict (id) do nothing;

