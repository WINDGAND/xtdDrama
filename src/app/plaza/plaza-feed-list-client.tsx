"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PlazaPostRow } from "@/lib/cached-feeds";
import { CommentsToggle } from "./comments-toggle";
import { LikeBar } from "@/components/likes/like-bar";
import { PostFooterActions } from "./post-footer-actions";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { SmartImage } from "@/components/ui/smart-image";
import { LiveLikeVideo } from "@/components/ui/live-like-video";

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
        <SmartImage
          src={avatarUrl}
          alt={`${name} 的头像`}
          page="plaza"
          slot="avatar"
          sizes="40px"
          className="h-full w-full rounded-none border-0"
          imageClassName="object-cover"
          fallbackHeightClassName="h-full"
          enableLightSkeleton={false}
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

function MomentsCard({ post, isFirst }: { post: PlazaPostRow; isFirst: boolean }) {
  const displayName = post.author_display_name?.trim() || "未命名";
  const entity = post.main_entity?.trim() || "一个瞬间";
  const emotion = post.user_emotion?.trim() || "有点复杂";
  const style = post.style?.trim() || "某种风格";
  const text = `${entity}。${emotion}，${style}。`;
  const timeText = formatTime(post.created_at);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const openLightbox = useCallback(() => setLightboxSrc(post.result_url), [post.result_url]);

  return (
    <article className="py-6 border-b border-zinc-100 dark:border-white/[0.06]" data-post-id={post.id}>
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="查看大图"
          onClose={() => setLightboxSrc(null)}
        />
      )}
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
              <SmartImage
                src={post.result_url}
                alt="生成图"
                page="plaza"
                slot="post-image"
                sizes="(max-width: 768px) calc(100vw - 64px), 520px"
                priority={isFirst}
                className="aspect-square w-full max-w-[520px] cursor-zoom-in"
                imageClassName="object-cover"
                onClick={openLightbox}
              />
            ) : (
              <LiveLikeVideo
                src={post.result_url}
                page="plaza"
                slot="post-video"
                className="aspect-square w-full max-w-[520px]"
                videoClassName="object-cover"
              />
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

export function PlazaFeedListClient({ initialPosts }: { initialPosts: PlazaPostRow[] }) {
  const [posts, setPosts] = useState<PlazaPostRow[]>(initialPosts);

  useEffect(() => {
    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent<{ postId?: string }>).detail;
      const postId = detail?.postId;
      if (!postId) return;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    };
    window.addEventListener("xtdDrama:post-deleted", onDeleted as EventListener);
    return () => window.removeEventListener("xtdDrama:post-deleted", onDeleted as EventListener);
  }, []);

  const hasPosts = useMemo(() => posts.length > 0, [posts.length]);
  if (!hasPosts) {
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
      {posts.map((p, idx) => (
        <MomentsCard key={p.id} post={p} isFirst={idx === 0} />
      ))}
    </div>
  );
}
