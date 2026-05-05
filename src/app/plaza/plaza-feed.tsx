import { getCachedPlazaPosts, getFreshPlazaPosts } from "@/lib/cached-feeds";
import { PlazaFeedListClient } from "./plaza-feed-list-client";

export async function PlazaFeed({ fresh = false }: { fresh?: boolean }) {
  const posts = fresh ? await getFreshPlazaPosts() : await getCachedPlazaPosts();

  if (!posts) {
    return (
      <div className="mt-6 px-1">
        <div className="text-sm text-zinc-700 dark:text-zinc-300">
          暂时读取不到广场数据。请确认 Supabase 已执行 `supabase-schema.sql`，并配置了环境变量。
        </div>
      </div>
    );
  }

  return <PlazaFeedListClient initialPosts={posts} />;
}
