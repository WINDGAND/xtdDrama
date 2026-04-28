"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/ui/image-lightbox";

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
        <ImageLightbox
          src={open.src}
          alt={open.label}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

