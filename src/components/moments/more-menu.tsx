"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Toast } from "@/components/ui/toast";

export function MoreMenu({ postId }: { postId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const link = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/posts/${postId}`;
  }, [postId]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setToast("已复制链接");
    } finally {
      setOpen(false);
    }
  }, [link]);

  const del = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm("确定删除这条内容吗？删除后不可恢复。");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        requestId?: string;
      } | null;
      if (!res.ok || !data?.success) {
        const rid = data?.requestId ? `（请求号：${data.requestId}）` : "";
        setToast(`${data?.error ?? "删除失败，请重试"}${rid}`);
        return;
      }
      setOpen(false);
      // 刷新列表页
      if (pathname === "/plaza") router.refresh();
      else router.push("/plaza");
    } finally {
      setBusy(false);
    }
  }, [busy, pathname, postId, router]);

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
      <Toast message={toast} onClear={() => setToast("")} />
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
            onClick={copyLink}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors"
            role="menuitem"
          >
            复制链接
          </button>
          <button
            type="button"
            onClick={del}
            disabled={busy}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/25 transition-colors disabled:opacity-60"
            role="menuitem"
          >
            {busy ? "删除中…" : "删除"}
          </button>
        </div>
      )}
    </div>
  );
}

