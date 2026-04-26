import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { MoreMenu } from "@/components/moments/more-menu";

interface PostDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { id } = await params;
  let post:
    | {
        id: string;
        created_at: string;
        mode: "image" | "video";
        style: string;
        result_url: string;
        main_entity: string | null;
        scene_state: string | null;
        user_emotion: string | null;
      }
    | null = null;

  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("posts")
      .select("id, created_at, mode, style, result_url, main_entity, scene_state, user_emotion")
      .eq("id", id)
      .maybeSingle();
    post = (data as typeof post) ?? null;
  } catch {
    post = null;
  }

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
          {!post ? (
            <div className="px-1">
              <div className="text-sm text-zinc-700 dark:text-zinc-300">
                暂时读取不到这条作品。请确认已执行 `supabase-schema.sql`，并且该作品存在。
              </div>
              <div className="mt-3">
                <Link href="/plaza" className="text-sm text-[color:var(--apple-blue)] hover:underline">
                  返回广场
                </Link>
              </div>
            </div>
          ) : (
            <div className="border-t border-zinc-100 dark:border-white/[0.06] pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {post.style}
                    {post.user_emotion ? (
                      <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-500">
                        · {post.user_emotion}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {post.main_entity ?? "未记录主实体"} · {post.scene_state ?? "未记录场景"}
                  </div>
                </div>
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
                  {post.mode === "image" ? "IMG" : "VID"}
                </span>
              </div>

              <div className="mt-4">
                {post.mode === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.result_url}
                    alt="生成结果"
                    className="w-full rounded-xl object-cover border border-zinc-200/30 dark:border-white/[0.08]"
                    style={{ maxHeight: 520 }}
                  />
                ) : (
                  <video
                    src={post.result_url}
                    controls
                    playsInline
                    className="w-full rounded-xl border border-zinc-200/30 dark:border-white/[0.08]"
                    style={{ maxHeight: 520 }}
                  />
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/create"
                  className="h-9 px-4 rounded-lg text-sm font-medium text-white apple-btn-primary flex items-center"
                >
                  再生成一张
                </Link>
                <Link
                  href="/plaza"
                  className="h-9 px-4 rounded-lg text-sm font-medium text-[color:var(--apple-blue)] hover:underline transition-colors flex items-center"
                >
                  返回广场
                </Link>
              </div>
            </div>
          )}

          <CommentsPanel postId={id} />
        </div>
      </div>
    </div>
  );
}

