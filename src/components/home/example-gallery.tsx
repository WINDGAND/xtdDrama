"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface ExamplePair {
  id: string;
  title: string;
  inputSrc: string;
  outputSrc: string;
  inputLabel?: string;
  outputLabel?: string;
}

export function ExampleGallery({
  examples,
}: {
  examples: ExamplePair[];
}) {
  const items = useMemo(() => examples.filter(Boolean), [examples]);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const active = items.find((e) => e.id === activeId) ?? items[0];

  if (!active) return null;

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
            示例
          </p>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            看一眼效果，再决定要不要上传
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            原图保持结构不变，只把“情绪”重绘成更夸张的视觉表达。
          </p>
        </div>

        {/* 极简 tabs */}
        {items.length > 1 && (
          <div className="hidden sm:flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1">
            {items.map((e) => {
              const selected = e.id === activeId;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setActiveId(e.id)}
                  className={[
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150",
                    selected
                      ? "bg-white dark:bg-[oklch(0.22_0.004_265)] text-zinc-900 dark:text-zinc-100 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400",
                  ].join(" ")}
                >
                  {e.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[oklch(0.18_0.004_265)] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="grid grid-cols-1 md:grid-cols-2"
          >
            <a
              href={active.inputSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block border-b md:border-b-0 md:border-r border-zinc-200/70 dark:border-white/[0.08]"
              aria-label="打开示例原图"
            >
              <div className="absolute left-3 top-3 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-white/80 dark:bg-black/30 backdrop-blur px-2 py-1 rounded-md border border-zinc-200/60 dark:border-white/[0.08]">
                {active.inputLabel ?? "原图"}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.inputSrc}
                alt={`${active.title} 原图`}
                className="w-full h-[240px] sm:h-[280px] object-cover"
              />
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-black/[0.02] dark:bg-white/[0.02]" />
            </a>

            <a
              href={active.outputSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block"
              aria-label="打开示例生成图"
            >
              <div className="absolute left-3 top-3 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-white/80 dark:bg-black/30 backdrop-blur px-2 py-1 rounded-md border border-zinc-200/60 dark:border-white/[0.08]">
                {active.outputLabel ?? "Drama 化"}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.outputSrc}
                alt={`${active.title} 生成图`}
                className="w-full h-[240px] sm:h-[280px] object-cover"
              />
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-black/[0.02] dark:bg-white/[0.02]" />
            </a>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 移动端 dots */}
      {items.length > 1 && (
        <div className="sm:hidden mt-3 flex items-center justify-center gap-2">
          {items.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-label={`切换示例：${e.title}`}
              onClick={() => setActiveId(e.id)}
              className={[
                "h-2 w-2 rounded-full transition-colors duration-150",
                e.id === activeId
                  ? "bg-blue-500"
                  : "bg-zinc-200 dark:bg-white/[0.18]",
              ].join(" ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

