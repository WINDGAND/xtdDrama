import { Suspense } from "react";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { MoreMenu } from "@/components/moments/more-menu";
import { PostDetailSkeleton } from "./post-detail-skeleton";
import { PostDetailBody } from "./post-detail-body";

interface PostDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { id } = await params;

  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              作品详情
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              作品 ID：<span className="font-mono text-zinc-500 dark:text-zinc-500">{id}</span>
            </p>
          </div>
          <MoreMenu postId={id} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8">
          <Suspense fallback={<PostDetailSkeleton />}>
            <PostDetailBody id={id} />
          </Suspense>

          <CommentsPanel postId={id} />
        </div>
      </div>
    </div>
  );
}
