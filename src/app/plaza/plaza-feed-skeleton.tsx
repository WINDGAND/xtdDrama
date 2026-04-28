/** 仅内容区骨架：供 route loading 与 Suspense fallback 复用 */
export function PlazaFeedSkeleton() {
  return (
    <div className="mt-6 flex flex-col border-t border-zinc-100 dark:border-white/[0.06] pt-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="py-6 border-b border-zinc-100 dark:border-white/[0.06] flex gap-3.5"
        >
          <div className="h-10 w-10 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-20 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-4 w-full max-w-md rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="mt-3 h-48 w-full max-w-md rounded-xl bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-3 w-24 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
