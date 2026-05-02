import Link from "next/link";
import { getCachedPostById } from "@/lib/cached-feeds";
import { LikeBar } from "@/components/likes/like-bar";
import { SmartImage } from "@/components/ui/smart-image";
import { LiveLikeVideo } from "@/components/ui/live-like-video";
import { MoreMenu } from "@/components/moments/more-menu";

export async function PostDetailBody({ id }: { id: string }) {
  const post = await getCachedPostById(id);

  if (!post) {
    return (
      <div className="px-1">
        <div className="text-sm text-zinc-700 dark:text-zinc-300">
          暂时读取不到这条作品。请确认已执行 `supabase-schema.sql`，并且该作品存在。
        </div>
        <div className="mt-3">
          <Link href="/plaza" prefetch className="text-sm text-[color:var(--apple-blue)] hover:underline">
            返回广场
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-100 dark:border-white/[0.06] pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {post.style}
            {post.user_emotion ? (
              <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-500">
                · {post.user_emotion}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {post.main_entity ?? "未记录主实体"} · {post.scene_state ?? "未记录场景"}
          </div>
        </div>
        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
          {post.mode === "image" ? "IMG" : "LIVE"}
        </span>
      </div>

      <div className="mt-4">
        {post.mode === "image" ? (
          <SmartImage
            src={post.result_url}
            alt="生成结果"
            page="post-detail"
            slot="post-image"
            sizes="(max-width: 768px) 100vw, 520px"
            className="aspect-square w-full max-w-[520px]"
            imageClassName="object-contain"
          />
        ) : (
          <LiveLikeVideo
            src={post.result_url}
            page="post-detail"
            slot="post-video"
            className="aspect-square w-full max-w-[520px]"
            videoClassName="object-contain"
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <LikeBar postId={id} />
        <MoreMenu postId={id} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/create"
          prefetch
          className="h-9 px-4 rounded-lg text-sm font-medium text-white apple-btn-primary flex items-center"
        >
          再生成一张
        </Link>
        <Link
          href="/me"
          prefetch
          className="h-9 px-4 rounded-lg text-sm font-medium text-[color:var(--apple-blue)] hover:underline transition-colors flex items-center"
        >
          返回我的作品
        </Link>
      </div>
    </div>
  );
}
