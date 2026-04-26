"use client";

import { useEffect, useMemo, useState } from "react";

export function HeroCompare({
  inputSrc,
  outputSrc,
  inputLabel = "原图",
  outputLabel = "对比图",
}: {
  inputSrc: string;
  outputSrc: string;
  inputLabel?: string;
  outputLabel?: string;
}) {
  const [open, setOpen] = useState<null | { src: string; label: string }>(null);
  const overlayLabel = useMemo(() => open?.label ?? "", [open?.label]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[oklch(0.18_0.004_265)] overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOpen({ src: inputSrc, label: inputLabel })}
          className="group relative block text-left border-b sm:border-b-0 sm:border-r border-zinc-200/70 dark:border-white/[0.08]"
          aria-label="放大查看原图示例"
        >
          <div className="absolute left-3 top-3 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-white/80 dark:bg-black/30 backdrop-blur px-2 py-1 rounded-md border border-zinc-200/60 dark:border-white/[0.08]">
            {inputLabel}
          </div>
          <div className="aspect-[16/10] bg-zinc-50 dark:bg-white/[0.02]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={inputSrc}
              alt={inputLabel}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-black/[0.02] dark:bg-white/[0.02]" />
        </button>

        <button
          type="button"
          onClick={() => setOpen({ src: outputSrc, label: outputLabel })}
          className="group relative block text-left"
          aria-label="放大查看对比图示例"
        >
          <div className="absolute left-3 top-3 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-white/80 dark:bg-black/30 backdrop-blur px-2 py-1 rounded-md border border-zinc-200/60 dark:border-white/[0.08]">
            {outputLabel}
          </div>
          <div className="aspect-[16/10] bg-zinc-50 dark:bg-white/[0.02]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={outputSrc}
              alt={outputLabel}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-black/[0.02] dark:bg-white/[0.02]" />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`预览：${overlayLabel}`}
          className="fixed inset-0 z-50"
        >
          <button
            type="button"
            aria-label="关闭预览"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(null)}
          />
          <div className="relative z-10 mx-auto h-full w-full max-w-[min(1200px,calc(100vw-32px))] px-4 py-8 flex items-center justify-center">
            <div className="w-full rounded-2xl border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-[oklch(0.16_0.004_265)] shadow-[0_20px_60px_oklch(0_0_0/0.25)] overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200/70 dark:border-white/[0.08]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                    {overlayLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                >
                  关闭
                </button>
              </div>

              <div className="bg-zinc-50 dark:bg-white/[0.02]">
                <div className="w-full max-h-[calc(100vh-180px)] flex items-center justify-center p-3 sm:p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={open.src}
                    alt={open.label}
                    className="max-h-[calc(100vh-220px)] w-auto max-w-full object-contain rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

