import { PostDetailSkeleton } from "./post-detail-skeleton";

export default function PostDetailLoading() {
  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="h-8 w-28 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-4 w-48 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
          <div className="h-8 w-10 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse shrink-0" />
        </div>
        <PostDetailSkeleton />
      </div>
    </div>
  );
}
