"use client";

import { useEffect, useMemo, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确定",
  cancelText = "取消",
  danger,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, onConfirm, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const confirmCls = useMemo(() => {
    const base =
      "h-9 px-4 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)] disabled:opacity-60 disabled:cursor-not-allowed";
    if (danger) return `${base} bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200`;
    return `${base} bg-[color:var(--apple-blue)] text-white hover:brightness-95`;
  }, [danger]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/20 dark:bg-black/45"
        aria-label="关闭"
        onClick={onCancel}
      />

      <div
        className={[
          "relative w-[min(92vw,420px)]",
          "rounded-2xl border border-zinc-200/70 dark:border-white/[0.10]",
          "bg-white/95 dark:bg-[oklch(0.18_0.004_265)]/95 backdrop-blur",
          "shadow-[0_18px_55px_oklch(0_0_0/0.18)] dark:shadow-[0_18px_55px_oklch(0_0_0/0.45)]",
          "px-5 py-4",
        ].join(" ")}
      >
        <div className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
        {description ? (
          <div className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{description}</div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-4 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 bg-zinc-100/80 dark:bg-white/[0.06] hover:bg-zinc-200/70 dark:hover:bg-white/[0.10] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={confirmCls}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

