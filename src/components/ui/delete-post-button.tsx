"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";

interface DeletePostButtonProps {
  postId: string;
}

export function DeletePostButton({ postId }: DeletePostButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<null | {
    title: string;
    description?: string;
    tone?: "success" | "error" | "info";
    durationMs?: number;
  }>(null);

  const handleDelete = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) {
        setToast({ title: "删除失败", description: data?.error ?? "请稍后重试", tone: "error", durationMs: 3800 });
        return;
      }
      setConfirmOpen(false);
      setToast({ title: "已删除", tone: "success" });
      // 刷新服务端数据，让列表实时消失
      router.refresh();
    } catch {
      setToast({ title: "删除失败", description: "网络异常，请重试", tone: "error", durationMs: 3800 });
    } finally {
      setBusy(false);
    }
  }, [busy, postId, router]);

  return (
    <>
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={() => setToast(null)}
      />

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label="删除作品"
        className={[
          "h-9 w-9 inline-flex items-center justify-center rounded-lg",
          "text-zinc-400 dark:text-zinc-500",
          "hover:text-red-500 dark:hover:text-red-400",
          "hover:bg-red-50 dark:hover:bg-red-950/30",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
          "transition-colors duration-150",
        ].join(" ")}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="确认删除这条作品？"
        description="删除后无法恢复，广场中的对应内容也会同步移除。"
        confirmText={busy ? "删除中…" : "删除"}
        cancelText="取消"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => !busy && setConfirmOpen(false)}
      />
    </>
  );
}
