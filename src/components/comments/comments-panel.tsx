"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/ui/toast";

type CommentRow = {
  id: string;
  created_at: string;
  author_type: "npc" | "user";
  npc_id: string | null;
  display_name: string | null;
  content: string;
  status: "ready" | "placeholder";
};

export function CommentsPanel({ postId }: { postId: string }) {
  const [items, setItems] = useState<CommentRow[] | null>(null);
  const [error, setError] = useState<string>("");
  const [generationTriggered, setGenerationTriggered] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState("");

  const url = useMemo(() => `/api/comments/list?postId=${encodeURIComponent(postId)}`, [postId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as {
        success: boolean;
        data?: CommentRow[];
        error?: string;
        requestId?: string;
      };
      if (!data.success) {
        setError(data.error ?? "读取失败");
        if (data.requestId) setToast(`请求号：${data.requestId}`);
        return;
      }
      setError("");
      setItems(data.data ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, [url]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const guardedLoad = async () => {
      if (!alive) return;
      await load();
    };

    guardedLoad();
    // 轻量轮询 10 秒，最大化“秒评可感知”
    timer = setInterval(guardedLoad, 2000);
    const stop = setTimeout(() => {
      if (timer) clearInterval(timer);
    }, 10000);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      clearTimeout(stop);
    };
  }, [load]);

  useEffect(() => {
    if (generationTriggered) return;
    if (!items || items.length === 0) return;
    const hasReadyNpc = items.some((x) => x.author_type === "npc" && x.status === "ready");
    if (hasReadyNpc) return;

    setGenerationTriggered(true);
    setGenerating(true);
    fetch("/api/comments/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    }).catch(() => {
      setToast("NPC 补全失败，可稍后重试");
    }).finally(() => setGenerating(false));
  }, [generationTriggered, items, postId]);

  const retryGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      await fetch("/api/comments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      setToast("已发起补全");
      await load();
    } catch {
      setToast("补全失败，请重试");
    } finally {
      setGenerating(false);
    }
  }, [generating, load, postId]);

  return (
    <section className="border-t border-zinc-100 dark:border-white/[0.06] pt-6">
      <Toast message={toast} onClear={() => setToast("")} durationMs={1600} />
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">评论</div>
        <div className="text-[12px] text-zinc-500 dark:text-zinc-500">
          {generating ? "正在补全 NPC…" : ""}
        </div>
      </div>
      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {error
          ? `评论加载失败：${error}`
          : items === null
            ? "NPC 正在赶来给你捧场…"
            : items.length === 0
              ? "还没有评论。NPC 正在赶来给你捧场…"
              : null}
      </div>

      {(!!error || (items && items.length === 0)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
          >
            重试加载
          </button>
          <button
            type="button"
            onClick={retryGenerate}
            disabled={generating}
            className={[
              "h-8 px-3 rounded-lg text-xs font-medium text-white apple-btn-primary",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {generating ? "补全中…" : "重试补全 NPC"}
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="mt-4 flex flex-col">
          {items.map((c) => (
            <div key={c.id} className="py-4 border-b border-zinc-100 dark:border-white/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                    {c.display_name ?? (c.author_type === "npc" ? "NPC" : "用户")}
                  </span>
                  {c.author_type === "npc" && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                      NPC
                    </span>
                  )}
                  {c.status === "placeholder" && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                      · 正在补全
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {c.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

