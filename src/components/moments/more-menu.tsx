"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/ui/toast";
import { useAuth } from "@/components/providers/auth-provider";
import { requestLogin } from "@/lib/request-login";

export function MoreMenu({ postId }: { postId: string }) {
  const { status: authStatus, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<null | { title: string; description?: string; tone?: "success" | "error" | "info"; durationMs?: number }>(null);
  const [liked, setLiked] = useState<boolean>(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!open) return;
    if (authStatus !== "authed" || !session?.user?.id) {
      Promise.resolve().then(() => setLiked(false));
      return;
    }
    let alive = true;
    fetch(`/api/likes/list?postId=${encodeURIComponent(postId)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((payload) => {
        if (!alive) return;
        const p = payload as { success?: boolean; data?: Array<{ actor_type?: string; user_id?: string | null }> } | null;
        if (!p?.success || !Array.isArray(p.data)) return;
        const uid = session.user.id;
        setLiked(p.data.some((x) => x.actor_type === "user" && x.user_id === uid));
      })
      .catch(() => void 0);
    return () => {
      alive = false;
    };
  }, [authStatus, open, postId, session?.user?.id]);

  const toggleLike = useCallback(async () => {
    if (busy) return;
    if (authStatus !== "authed") {
      requestLogin("登录后即可点赞");
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/likes/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; liked?: boolean } | null;
      if (!res.ok || !data?.success) {
        setToast({ title: "操作失败", description: "请重试", tone: "error", durationMs: 3800 });
        return;
      }
      const liked = !!data.liked;
      setLiked(liked);
      window.dispatchEvent(new CustomEvent("xtdDrama:likes-updated", { detail: { postId } }));
      setToast({ title: liked ? "已赞" : "已取消赞", tone: "success" });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, [authStatus, busy, postId]);

  const goComment = useCallback(() => {
    setOpen(false);
    if (authStatus !== "authed") {
      requestLogin("登录后即可参与评论");
      return;
    }
    window.dispatchEvent(new CustomEvent("xtdDrama:comment-compose", { detail: { postId } }));
  }, [authStatus, postId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-10 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-white/[0.06] transition-colors"
        aria-label="更多"
        aria-expanded={open}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mx-auto"
        >
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      </button>

      {open && (
        <div
          className={[
            "absolute right-0 top-9 z-50 min-w-[160px]",
            "rounded-xl border border-zinc-200/70 dark:border-white/[0.10]",
            "bg-white/95 dark:bg-[oklch(0.18_0.004_265)]/95 backdrop-blur",
            "shadow-[0_10px_30px_oklch(0_0_0/0.10)] dark:shadow-[0_10px_30px_oklch(0_0_0/0.35)]",
            "p-1",
          ].join(" ")}
          role="menu"
        >
          <button
            type="button"
            onClick={toggleLike}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors"
            role="menuitem"
          >
            <span className="inline-flex items-center gap-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={liked ? "text-rose-500" : "text-zinc-700 dark:text-zinc-100"}
              >
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-8.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
              {liked ? "取消点赞" : "赞"}
            </span>
          </button>
          <button
            type="button"
            onClick={goComment}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors"
            role="menuitem"
          >
            <span className="inline-flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
              </svg>
              评论
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

