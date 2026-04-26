import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { MoreMenu } from "@/components/moments/more-menu";

type PostRow = {
  id: string;
  created_at: string;
  mode: "image" | "video";
  style: string;
  result_url: string;
  main_entity: string | null;
  scene_state: string | null;
  user_emotion: string | null;
};

async function fetchPosts(): Promise<PostRow[] | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("posts")
      .select("id, created_at, mode, style, result_url, main_entity, scene_state, user_emotion")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return null;
    return (data ?? []) as PostRow[];
  } catch {
    return null;
  }
}

function formatTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "刚刚";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  return `${day} 天前`;
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().slice(0, 1) || "我";
  return (
    <div
      className={[
        "h-10 w-10 rounded-lg flex items-center justify-center",
        "border border-zinc-200/80 dark:border-white/[0.10]",
        "bg-white dark:bg-white/[0.02]",
        "text-sm font-semibold text-zinc-700 dark:text-zinc-200",
        "select-none",
      ].join(" ")}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function MomentsCard({ post }: { post: PostRow }) {
  // 当前未引入账号体系：用一个克制的默认昵称，避免“伪造真实社交”
  const displayName = "你";
  const entity = post.main_entity?.trim() || "一个瞬间";
  const emotion = post.user_emotion?.trim() || "有点复杂";
  const style = post.style?.trim() || "某种风格";
  const text = `${entity}。${emotion}，${style}。`;

  return (
    <article className="py-6 border-b border-zinc-100 dark:border-white/[0.06]">
      <div className="flex items-start gap-3.5">
        <div className="flex-shrink-0">
          <Avatar name={displayName} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {displayName}
              </div>
            </div>
          </div>

          <div className="mt-1.5 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
            {text}
          </div>

          <div className="mt-3">
            {post.mode === "image" ? (
              <Link href={`/posts/${post.id}`} className="inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.result_url}
                  alt="生成图"
                  className={[
                    "rounded-xl object-cover max-w-full",
                    // 非卡片化：不再用“边框+阴影把图框起来”，只保留极轻边界（可在暗色态提升可读性）
                    "border border-zinc-200/30 dark:border-white/[0.08]",
                  ].join(" ")}
                  style={{ maxHeight: 360 }}
                />
              </Link>
            ) : (
              <div className="rounded-xl border border-zinc-200/30 dark:border-white/[0.08] overflow-hidden">
                <video
                  src={post.result_url}
                  controls
                  playsInline
                  className="w-full"
                  style={{ maxHeight: 360 }}
                />
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-[12px] text-zinc-500 dark:text-zinc-500">
              {formatTime(post.created_at)}
            </div>

            <div className="flex items-center gap-1.5">
              <Link
                href={`/posts/${post.id}`}
                className="h-8 px-3 rounded-lg text-xs font-medium text-[color:var(--apple-blue)] hover:underline transition-colors"
                aria-label="查看详情"
              >
                详情
              </Link>
              <MoreMenu postId={post.id} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function PlazaPage() {
  const posts = await fetchPosts();

  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              广场
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              像朋友圈一样刷，但依旧保持 Apple 克制风。
            </p>
          </div>
          <Link
            href="/create"
            className="hidden sm:flex h-9 items-center px-4 rounded-lg text-sm font-medium text-white apple-btn-primary"
          >
            去创作
          </Link>
        </div>

        {!posts ? (
          <div className="mt-6 px-1">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              暂时读取不到广场数据。请确认 Supabase 已执行 `supabase-schema.sql`，并配置了环境变量。
            </div>
          </div>
        ) : posts.length === 0 ? (
          <div className="mt-6 px-1">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              还没有作品。去创作页生成一张，然后发布到广场吧。
            </div>
            <div className="mt-3">
              <Link href="/create" className="text-sm text-[color:var(--apple-blue)] hover:underline">
                现在去创作
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {posts.map((p) => (
              <MomentsCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

