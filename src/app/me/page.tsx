import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { MoreMenu } from "@/components/moments/more-menu";

type PostRow = {
  id: string;
  created_at: string;
  mode: "image" | "video";
  style: string;
  main_entity: string | null;
  user_emotion: string | null;
};

async function fetchPosts(): Promise<PostRow[] | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("posts")
      .select("id, created_at, mode, style, main_entity, user_emotion")
      .order("created_at", { ascending: false })
      .limit(50);
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

export default async function MePage() {
  const posts = await fetchPosts();

  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              我的作品
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              这里会按时间倒序展示你发布过的内容（当前未接入账号体系，展示本库 posts）。
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
          <div className="mt-6 px-1 text-sm text-zinc-700 dark:text-zinc-300">
            暂时读取不到作品列表。请确认 Supabase 环境变量配置正确。
          </div>
        ) : posts.length === 0 ? (
          <div className="mt-6 px-1">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              你还没有发布过作品。
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
              <div key={p.id} className="py-5 border-b border-zinc-100 dark:border-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {p.style}
                      {p.user_emotion ? (
                        <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-500">
                          · {p.user_emotion}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {p.main_entity ?? "未记录主实体"} · {formatTime(p.created_at)}
                      <span className="ml-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                        {p.mode === "image" ? "IMG" : "VID"}
                      </span>
                    </div>
                    <div className="mt-2">
                      <Link href={`/posts/${p.id}`} className="text-sm text-[color:var(--apple-blue)] hover:underline">
                        查看详情
                      </Link>
                    </div>
                  </div>
                  <MoreMenu postId={p.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

