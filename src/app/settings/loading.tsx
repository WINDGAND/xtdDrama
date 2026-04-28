export default function SettingsLoading() {
  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="h-8 w-20 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
        <div className="mt-6 space-y-4">
          <div className="h-4 w-14 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] border-y border-zinc-100 dark:border-white/[0.06]">
            {[0, 1].map((i) => (
              <div key={i} className="py-3 flex items-center justify-between gap-4">
                <div className="h-4 w-16 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
                <div className="h-8 flex-1 max-w-[200px] rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
                <div className="h-8 w-20 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 space-y-4">
          <div className="h-4 w-20 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          <div className="space-y-3 border-y border-zinc-100 dark:border-white/[0.06] py-2">
            {[0, 1].map((i) => (
              <div key={i} className="py-3 flex justify-between gap-4">
                <div className="h-4 w-14 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
                <div className="h-9 w-40 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
