"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const CommentsPanel = dynamic(
  () => import("@/components/comments/comments-panel").then((m) => ({ default: m.CommentsPanel })),
  {
    ssr: false,
    loading: () => (
      <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">评论正在赶来…</div>
    ),
  }
);

function hasStagedPost(postId: string) {
  try {
    const raw = window.sessionStorage.getItem(`xtdDrama.stagedAt.${postId}`);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0;
  } catch {
    return false;
  }
}

export function CommentsToggle({
  postId,
  postUserId,
  commentCount = 0,
  preview,
}: {
  postId: string;
  postUserId?: string | null;
  commentCount?: number;
  preview?: string | null;
}) {
  const staged = useMemo(() => hasStagedPost(postId), [postId]);

  return (
    <div className="mt-3">
      <div className="text-sm text-zinc-500 dark:text-zinc-500">
        {commentCount > 0 ? `${commentCount} 条评论` : "评论"}
      </div>

      {preview ? (
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
          {preview}
        </div>
      ) : null}

      <div id={`comments-${postId}`}>
        <CommentsPanel
          postId={postId}
          postUserId={postUserId}
          enablePolling={staged}
          enableNpcAutoGenerate={false}
        />
      </div>
    </div>
  );
}

