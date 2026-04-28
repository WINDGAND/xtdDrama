import Link from "next/link";
import { Suspense } from "react";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { MePostsSkeleton } from "./me-posts-skeleton";
import { MePostsSection } from "./me-posts-section";
import { LoginTriggerButton } from "@/components/ui/login-trigger-button";

export default async function MePage() {
  let userId: string | null = null;
  try {
    const auth = await createAuthServerClient();
    const { data: userData } = await auth.auth.getUser();
    userId = userData.user?.id ?? null;
  } catch {
    userId = null;
  }

  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              我的作品
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              这里会按时间倒序展示你发布过的内容。
            </p>
          </div>
          {userId ? (
            <Link
              href="/create"
              prefetch
              className="hidden sm:flex h-9 items-center px-4 rounded-lg text-sm font-medium text-white apple-btn-primary"
            >
              去创作
            </Link>
          ) : null}
        </div>

        {!userId ? (
          <div className="mt-6 px-1">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              你还没有发布过作品，或者尚未登录。
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <LoginTriggerButton
                hint="登录后即可查看和管理你的作品"
                direct
                className="text-sm text-[color:var(--apple-blue)] hover:underline"
              />
            </div>
          </div>
        ) : (
          <Suspense fallback={<MePostsSkeleton />}>
            <MePostsSection userId={userId} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
