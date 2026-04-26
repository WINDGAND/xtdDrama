"use client";

import { useEffect } from "react";

export function Toast({
  message,
  onClear,
  durationMs = 1400,
}: {
  message: string;
  onClear: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onClear, durationMs);
    return () => window.clearTimeout(t);
  }, [durationMs, message, onClear]);

  if (!message) return null;

  return (
    <div className="fixed left-1/2 top-4 -translate-x-1/2 z-[60]">
      <div className="px-3 py-1.5 rounded-full border border-zinc-200/70 dark:border-white/[0.10] bg-white/92 dark:bg-[oklch(0.16_0.004_265)]/92 backdrop-blur text-xs text-zinc-700 dark:text-zinc-200 shadow-[0_6px_20px_oklch(0_0_0/0.10)]">
        {message}
      </div>
    </div>
  );
}

