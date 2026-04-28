"use client";

import { MoreMenu } from "@/components/moments/more-menu";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  postId: string;
  postUserId: string | null;
  timeText: string;
};

export function PostFooterActions({ postId, postUserId, timeText }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<null | { title: string; description?: string; tone?: "success" | "error" | "info"; durationMs?: number }>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const userId = session?.user?.id ?? null;
  const canDelete = authStatus === "authed" && !!userId && !!postUserId && userId === postUserId;
  const clearToast = useCallback(() => setToast(null), []);

  const del = useCallback(async () => {
    if (!canDelete || busy) return;
    setConfirmOpen(true);
  }, [busy, canDelete]);

  const doDelete = useCallback(async () => {
    if (!canDelete || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string; requestId?: string } | null;
      if (!res.ok || !data?.success) {
        const rid = data?.requestId ? `（请求号：${data.requestId}）` : "";
        setToast({ title: "删除失败", description: `${data?.error ?? "请重试"}${rid}`, tone: "error", durationMs: 3800 });
        return;
      }
      if (pathname === "/plaza") router.refresh();
      else router.push("/plaza");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }, [busy, canDelete, pathname, postId, router]);

  const delBtnCls = useMemo(
    () => [
      "h-8 w-8 grid place-items-center rounded-lg transition-colors",
      "text-zinc-500 dark:text-zinc-500",
      "hover:bg-zinc-100/70 dark:hover:bg-white/[0.06] hover:text-zinc-800 dark:hover:text-zinc-200",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)]",
      busy ? "opacity-60 cursor-not-allowed" : "",
    ].join(" "),
    [busy]
  );

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />
      <ConfirmDialog
        open={confirmOpen}
        title="确定删除这条内容吗？"
        description="删除后不可恢复。"
        confirmText="确定删除"
        cancelText="取消"
        danger
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doDelete}
      />
      <div className="text-[12px] text-zinc-500 dark:text-zinc-500">
        {timeText}
      </div>

      <div className="flex items-center gap-1.5">
        {canDelete ? (
          <button
            type="button"
            onClick={del}
            disabled={busy}
            className={delBtnCls}
            aria-label="删除"
            title="删除"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M6 6l1 16h10l1-16" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        ) : null}
        <MoreMenu postId={postId} />
      </div>
    </div>
  );
}

