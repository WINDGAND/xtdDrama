export function PostDetailSkeleton() {
  return (
    <>
      <div className="mt-6 border-t border-zinc-100 dark:border-white/[0.06] pt-6 space-y-4">
        <div className="flex justify-between gap-3">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="h-4 w-40 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-3 w-56 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
          <div className="h-4 w-10 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse shrink-0" />
        </div>
        <div className="h-64 sm:h-80 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          <div className="h-9 w-24 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
        </div>
      </div>
      <div className="mt-8 border-t border-zinc-100 dark:border-white/[0.06] pt-6 space-y-4">
        <div className="h-4 w-16 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="py-4 border-b border-zinc-100 dark:border-white/[0.06] space-y-2">
            <div className="h-3 w-24 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-4 w-full rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
        ))}
      </div>
    </>
  );
}
