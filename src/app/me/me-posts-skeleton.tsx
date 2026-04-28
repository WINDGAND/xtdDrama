export function MePostsSkeleton() {
  return (
    <div className="mt-6 flex flex-col border-t border-zinc-100 dark:border-white/[0.06] pt-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="py-5 border-b border-zinc-100 dark:border-white/[0.06] flex justify-between gap-3"
        >
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-48 max-w-full rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-3 w-64 max-w-full rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-4 w-20 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
          <div className="h-8 w-10 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}
