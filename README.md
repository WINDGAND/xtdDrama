# 小题大Drama（xtd-drama）

基于 Next.js 的 Web 应用：用户上传日常照片，经多模态感知与「Guess & Refine」风格选项后，调用腾讯 TokenHub 上的生图/视频任务生成夸张化视觉结果，并可发布到内置广场；发布后由服务端写入 NPC 点赞与 AI 生成评论，形成轻量社交反馈闭环。

**产品定义与验收口径**以仓库根目录 [`PRD.md`](./PRD.md) 为准（赛题背景、功能范围、UI 约束等）。

---

## 功能概览（与当前代码一致）

| 能力 | 实现说明 |
|------|----------|
| 首页 | `/` 重定向至 `/create` |
| 创作主流程 | `/create`：拖拽/选择图片 → 可选压缩为 JPEG → 并行上传 Supabase Storage 与调用 `/api/vision` → 展示感知结果与 `GuessRefine` 三选一 → 调用 `/api/image/submit` 或 `/api/video/submit` 并轮询对应 `query` 接口 |
| 结构示意 | 前端用 Canvas 从原图提取边缘图（`src/lib/edge-extract.ts`），仅作 UI 上的「结构锁定」提示，**不等同**于服务端 ControlNet 管线 |
| 降级演示 | Vision 或生成接口失败时，可进入演示模式，使用预置 mock 数据与示例图（**演示模式下不可发布**） |
| 发布 | 登录用户调用 `/api/posts/create`：将模型返回的临时 URL 在可能情况下 **拉回并写入 Supabase Storage**，再插入 `posts` 表 |
| NPC 点赞 | `/api/likes/npc-generate` 向 `post_likes` 插入 5 条 NPC 记录（**不经过大模型**） |
| NPC 评论 | `/api/comments/generate` 调用 TokenHub 文本模型，解析 JSON 后写入 `comments` |
| 广场 / 我的 / 详情 | `/plaza`、`/me`、`/posts/[id]`；列表数据经服务端缓存辅助（见 `src/lib/cached-feeds.ts`） |
| 认证与资料 | Supabase Auth（邮箱等）；`/auth/login`；资料表见 `supabase-auth-schema.sql` |
| 设置与 FAQ | `/settings`、`/faq` |
| 资源下载 | `/api/download`：HTTPS 代理下载，规避浏览器跨域限制 |

---

## 技术栈

- **框架**：Next.js **16.2.4**（App Router、Route Handlers、`experimental.viewTransition`）
- **UI**：React 19、Tailwind CSS 4、Framer Motion、`next-themes`、Geist 字体、Base UI 等
- **数据**：Supabase（Postgres + Storage + Auth）；服务端使用 **service_role** 密钥（仅服务端，勿暴露到前端）
- **AI 网关**：腾讯 **TokenHub** 双 Plan 分流：HY Token Plan 调用 `hy3-preview` 文本能力，通用 Token Plan / MaaS 调用 `youtu-vita`、`hy-image`、`hy-video`

> Next.js 16 与历史版本存在 API/约定差异，改路由或数据获取前建议查阅本仓库依赖版本对应文档（见 [`AGENTS.md`](./AGENTS.md)）。

---

## 仓库结构（摘要）

```
src/app/           # 页面与 App Router API（api/*/route.ts）
src/components/    # UI 组件（布局、上传、Guess、评论等）
src/lib/           # Supabase、TokenHub 封装、边缘提取、缓存与可观测性等
src/types/         # TypeScript 类型（vision、guess、image、video 等）
supabase-schema.sql       # 广场最小表：posts、post_likes、comments、npc_profiles
supabase-auth-schema.sql  # Auth 后补齐：posts.user_id、profiles、RLS 策略
PRD.md                    # 产品需求文档（真源）
```

---

## 本地开发

### 前置条件

- Node.js（建议使用当前维护版 LTS）
- 已开通的 **Supabase** 项目与 **TokenHub** API Key（以及账号内已开通的生图/视频等能力，以控制台为准）

### 安装与启动

```bash
npm install
npm run dev
```

默认开发地址：`http://localhost:3000`（入口会进入 `/create`）。

其他脚本：

| 命令 | 说明 |
|------|------|
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器（需先 `build`） |
| `npm run lint` | ESLint |

---

## 环境变量

在仓库根目录创建 **`.env.local`**（勿提交密钥）。下列变量与代码中的读取逻辑一致。

### 必填（完整链路）

| 变量 | 说明 |
|------|------|
| `TOKENHUB_API_KEY` | **HY Token Plan** Bearer 密钥；用于 Guess / NPC / Vision 文本兜底等纯文本 `chat/completions` |
| `TOKENHUB_BASE_URL` | HY Token Plan Base URL，例如 `https://api.lkeap.cloud.tencent.com/plan/v3` |
| `TOKENHUB_MAAS_API_KEY` | **通用 Token Plan / MaaS** Bearer 密钥；用于 `youtu-vita` 视觉、`hy-image` 生图、`hy-video` 生视频 |
| `TOKENHUB_MAAS_BASE_URL` | 通用 Token Plan / MaaS Base URL，例如 `https://tokenhub.tencentmaas.com` |
| `SUPABASE_URL` | Supabase 项目根 URL（**不要**带 `/rest/v1`；服务端会规范化） |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 Supabase 密钥（Storage 上传、帖子写入、NPC 数据等） |
| `NEXT_PUBLIC_SUPABASE_URL` | 与控制台一致的 Project URL（浏览器与 cookie 会话） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名密钥（浏览器 `@supabase/ssr` 客户端） |

### 可选 / 默认值

| 变量 | 默认或说明 |
|------|------------|
| `TOKENHUB_TIMEOUT_MS` | `30000` |
| `TOKENHUB_VITA_MODEL` | `youtu-vita`（`/api/vision` 多模态主模型） |
| `TOKENHUB_GUESS_MODEL` | `hy3-preview`（HY Token Plan 个人版文本模型；Guess 与部分兜底使用） |
| `TOKENHUB_EMOTION_MODEL` | 未设置时回退为 `TOKENHUB_GUESS_MODEL`（Vision 内情绪校准、场景补全等） |
| `TOKENHUB_NPC_MODEL` | 未设置时回退为 `TOKENHUB_GUESS_MODEL`（NPC 评论/AI 回复） |
| `TOKENHUB_MAX_TOKENS` | `900`（Vision 请求） |
| `TOKENHUB_IMAGE_MODEL` | `hy-image-v3.0` |
| `TOKENHUB_VIDEO_MODEL` | `hy-video-1.5` |
| `SUPABASE_STORAGE_BUCKET` | `xtd-drama`（原图与发布镜像等，需与控制台 Storage 桶名一致） |
| `SUPABASE_AVATAR_BUCKET` | `avatars`（头像上传 API 使用） |

### 前端功能开关（可选）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SMART_IMAGE_ENABLED` | 设为 `false` 可关闭部分 SmartImage 行为 |
| `NEXT_PUBLIC_NEXT_IMAGE_ENABLED` | 设为 `false` 可关闭 Next Image 优化路径 |
| `NEXT_PUBLIC_IMAGE_METRICS_ENABLED` | 设为 `false` 可关闭图片相关前端埋点 |

开发环境下，`/api/vision` 与 `/api/guess` 的 JSON 响应中可能附带 `rawContent` 字段便于调试；生产环境不会附带。

---

## 数据库与 Storage 初始化

在 **Supabase SQL Editor** 中按顺序执行：

1. [`supabase-schema.sql`](./supabase-schema.sql)  
   创建 `posts`、`post_likes`、`comments`、`npc_profiles` 及索引；初始化 5 名 NPC 档案。

2. [`supabase-auth-schema.sql`](./supabase-auth-schema.sql)  
   为 `posts` 增加 `user_id`、创建 `profiles`、启用并配置 **RLS**（游客可读帖子，写入/删改仅限本人）。

**Storage**

- 创建与 `SUPABASE_STORAGE_BUCKET`（默认 `xtd-drama`）一致的桶，并按产品需要配置 **公开读** 或签名策略，确保 `posts/create` 镜像后的 `publicUrl` 可被广场访问。
- 若使用头像上传，创建 `avatars` 桶（或修改 `SUPABASE_AVATAR_BUCKET`），权限需与 [`src/app/api/avatars/upload/route.ts`](./src/app/api/avatars/upload/route.ts) 的写入方式匹配。

未正确执行 SQL 或桶策略时，广场可能提示无法读取数据，或发布/上传报错；具体错误以接口返回与服务器日志为准。

---

## 主要 API 路由（服务端）

| 路径 | 作用 |
|------|------|
| `POST /api/vision` | 多模态图像理解 → 结构化感知 JSON |
| `POST /api/guess` | Guess & Refine：破冰文案 + 3 条带中文叙事 prompt 的选项 |
| `POST /api/storage/upload` | base64 图片写入 Supabase Storage，返回 `publicUrl` |
| `POST /api/image/submit` · `POST /api/image/query` | TokenHub 生图任务提交与查询 |
| `POST /api/video/submit` · `POST /api/video/query` | TokenHub 视频任务提交与查询 |
| `POST /api/posts/create` | 登录后发布；可能镜像生成图到 Storage |
| `POST /api/likes/npc-generate` | 为帖子批量插入 NPC 点赞 |
| `POST /api/comments/generate` | LLM 生成 5 条 NPC 评论并入库 |
| `GET /api/download` | HTTPS 资源代理下载（防 SSRF，仅 `https`） |

其余如帖子列表、评论列表、点赞切换、个人资料等见 `src/app/api/` 下各 `route.ts` 文件注释。

---

## 部署提示

- 适用于 **Vercel** 等 Serverless 托管：将上述环境变量配置到托管平台；**切勿**将 `SUPABASE_SERVICE_ROLE_KEY`、`TOKENHUB_API_KEY` 或 `TOKENHUB_MAAS_API_KEY` 以前缀 `NEXT_PUBLIC_` 暴露到浏览器。
- 若刚修改 `.env.local` 或 Vercel 环境变量，必须重启本地 `next dev` 或重新部署，否则服务端进程仍会使用旧 Key / 旧 Base URL。
- `metadataBase` 与部分 SEO 配置在 [`src/app/layout.tsx`](./src/app/layout.tsx) 中写死为示例域名，上线时请改为你的正式域名。
- 生产构建：`npm run build`。

---

## 文档与协作

- 需求、交互与术语：**[`PRD.md`](./PRD.md)**
- 仓库内若与 PRD 表述不一致，以 **PRD** 为产品真源；实现以代码为准时，建议在迭代中同步更新 PRD，避免口径漂移。

---

## 许可与声明

本项目为参赛作品相关仓库；第三方 API（TokenHub、Supabase）的使用须遵守各自服务条款与计费规则。生成内容请勿用于违法或侵权场景。
