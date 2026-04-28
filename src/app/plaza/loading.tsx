import { PlazaFeedSkeleton } from "./plaza-feed-skeleton";

export default function PlazaLoading() {
  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="h-8 w-24 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-4 w-64 max-w-full rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          </div>
          <div className="hidden sm:block h-9 w-20 rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse shrink-0" />
        </div>
        <PlazaFeedSkeleton />
      </div>
    </div>
  );
}
