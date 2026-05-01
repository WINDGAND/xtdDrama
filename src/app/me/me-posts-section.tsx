import Link from "next/link";
import { getCachedMePosts, type MePostRow } from "@/lib/cached-feeds";
import { DeletePostButton } from "@/components/ui/delete-post-button";

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

export async function MePostsSection({ userId }: { userId: string }) {
  const posts = await getCachedMePosts(userId);

  if (!posts) {
    return (
      <div className="mt-6 px-1 text-sm text-zinc-700 dark:text-zinc-300">
        暂时读取不到作品列表。请确认 Supabase 环境变量配置正确。
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="mt-6 px-1">
        <div className="text-sm text-zinc-700 dark:text-zinc-300">
          你还没有发布过作品。
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/create" prefetch className="text-sm text-[color:var(--apple-blue)] hover:underline">
            去创作
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {posts.map((p: MePostRow) => (
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
                  {p.mode === "image" ? "IMG" : "LIVE"}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 pt-0.5 flex items-center gap-1">
              <Link
                href={`/posts/${p.id}`}
                prefetch
                className={[
                  "h-9 inline-flex items-center px-3 rounded-lg text-sm font-medium",
                  "text-[color:var(--apple-blue)]",
                  "hover:bg-zinc-100/70 dark:hover:bg-white/[0.06]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)]",
                  "transition-colors",
                ].join(" ")}
              >
                查看详情
              </Link>
              <DeletePostButton postId={p.id} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
