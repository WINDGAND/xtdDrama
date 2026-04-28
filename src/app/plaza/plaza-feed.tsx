import Link from "next/link";
import { getCachedPlazaPosts, type PlazaPostRow } from "@/lib/cached-feeds";
import { CommentsToggle } from "./comments-toggle";
import { LikeBar } from "@/components/likes/like-bar";
import { PostFooterActions } from "./post-footer-actions";

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

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initial = name.trim().slice(0, 1) || "我";
  return (
    <div className="h-10 w-10 rounded-lg overflow-hidden border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02]">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={`${name} 的头像`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={[
            "h-full w-full flex items-center justify-center",
            "text-sm font-semibold text-zinc-700 dark:text-zinc-200",
            "select-none",
          ].join(" ")}
          aria-hidden="true"
        >
          {initial}
        </div>
      )}
    </div>
  );
}

function MomentsCard({ post }: { post: PlazaPostRow }) {
  const displayName = post.author_display_name?.trim() || "未命名";
  const entity = post.main_entity?.trim() || "一个瞬间";
  const emotion = post.user_emotion?.trim() || "有点复杂";
  const style = post.style?.trim() || "某种风格";
  const text = `${entity}。${emotion}，${style}。`;
  const timeText = formatTime(post.created_at);

  return (
    <article className="py-6 border-b border-zinc-100 dark:border-white/[0.06]">
      <div className="flex items-start gap-3.5">
        <div className="flex-shrink-0">
          <Avatar name={displayName} avatarUrl={post.author_avatar_url} />
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.result_url}
                alt="生成图"
                loading="lazy"
                decoding="async"
                className={[
                  "rounded-xl object-cover max-w-full",
                  "border border-zinc-200/30 dark:border-white/[0.08]",
                ].join(" ")}
                style={{ maxHeight: 360 }}
              />
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

          <LikeBar postId={post.id} initialItems={post.initial_likes} autoGenerate={false} />

          <PostFooterActions
            postId={post.id}
            postUserId={post.user_id}
            timeText={timeText}
          />

          <CommentsToggle
            postId={post.id}
            postUserId={post.user_id}
            commentCount={post.comment_count}
            preview={post.comment_preview}
          />
        </div>
      </div>
    </article>
  );
}

export async function PlazaFeed() {
  const posts = await getCachedPlazaPosts();

  if (!posts) {
    return (
      <div className="mt-6 px-1">
        <div className="text-sm text-zinc-700 dark:text-zinc-300">
          暂时读取不到广场数据。请确认 Supabase 已执行 `supabase-schema.sql`，并配置了环境变量。
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="mt-6 px-1">
        <div className="text-sm text-zinc-700 dark:text-zinc-300">
          还没有作品。去创作页生成一张，然后发布到广场吧。
        </div>
        <div className="mt-3">
          <Link href="/create" prefetch className="text-sm text-[color:var(--apple-blue)] hover:underline">
            现在去创作
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {posts.map((p) => (
        <MomentsCard key={p.id} post={p} />
      ))}
    </div>
  );
}
