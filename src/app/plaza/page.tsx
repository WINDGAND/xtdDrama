import Link from "next/link";
import { Suspense } from "react";
import { PlazaFeedSkeleton } from "./plaza-feed-skeleton";
import { PlazaFeed } from "./plaza-feed";
import { PlazaPublishedNotice } from "./plaza-published-notice";

export default function PlazaPage() {
  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              广场
            </h1>
          </div>
          <Link
            href="/create"
            prefetch
            className="hidden sm:flex h-9 items-center px-4 rounded-lg text-sm font-medium text-white apple-btn-primary"
          >
            去创作
          </Link>
        </div>

        <Suspense fallback={<PlazaFeedSkeleton />}>
          <PlazaFeed />
        </Suspense>
        <Suspense fallback={null}>
          <PlazaPublishedNotice />
        </Suspense>
      </div>
    </div>
  );
}
