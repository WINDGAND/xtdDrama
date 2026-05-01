"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ToastTone = "success" | "error" | "info";

export function Toast({
  title,
  description,
  tone = "info",
  onClear,
  durationMs,
  dismissOnClick = true,
}: {
  title: string;
  description?: string;
  tone?: ToastTone;
  onClear: () => void;
  durationMs?: number;
  dismissOnClick?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  const computedDuration =
    durationMs ??
    (tone === "error" ? 3800 : 2600);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!title || !mounted) return;
    const t = window.setTimeout(onClear, computedDuration);
    return () => window.clearTimeout(t);
  }, [computedDuration, mounted, onClear, title]);

  if (!title) return null;

  const barClass =
    tone === "success"
      ? "bg-emerald-400/50 dark:bg-emerald-300/35"
      : tone === "error"
        ? "bg-rose-400/55 dark:bg-rose-300/40"
        : "bg-zinc-300/70 dark:bg-white/[0.12]";

  const node = (
    <div
      className={[
        "fixed right-4 z-[100]",
        // 顶栏高度：mobile≈56px，desktop≈64px；Toast 从顶栏下方弹出
        "top-[calc(env(safe-area-inset-top)+64px)]",
        "sm:top-[calc(env(safe-area-inset-top)+72px)]",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div
        onClick={dismissOnClick ? onClear : undefined}
        className={[
          "relative",
          "flex gap-3",
          "px-4 py-3 rounded-xl",
          "border border-zinc-200/80 dark:border-white/[0.12]",
          "bg-white/96 dark:bg-[oklch(0.18_0.004_265)]/96",
          "backdrop-blur",
          "text-zinc-900 dark:text-zinc-50",
          "shadow-[0_10px_30px_oklch(0_0_0/0.16)] dark:shadow-[0_10px_30px_oklch(0_0_0/0.35)]",
          "max-w-[min(420px,calc(100vw-24px))]",
          "animate-toast-in",
          dismissOnClick ? "cursor-pointer" : "",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={["absolute left-0 top-0 h-full w-[2px] rounded-l-xl", barClass].join(" ")}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-5 truncate">
            {title}
          </div>
          {description ? (
            <div className="mt-0.5 text-[12.5px] leading-5 text-zinc-600 dark:text-zinc-300 line-clamp-2">
              {description}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(node, document.body);
}
