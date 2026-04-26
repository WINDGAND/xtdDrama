"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { motionDurations, motionEase, motionDistances, motionStaggers } from "@/lib/motion";
import type { VisionAnalysis } from "@/types/vision";
import type { GuessOption, GuessResult } from "@/types/guess";

export interface GuessRefineProps {
  analysis: VisionAnalysis;
  onGenerate: (option: GuessOption, mode: "image" | "video") => void;
}

/* 打字机 Hook */
function useTypewriter(text: string, speed = 22): string {
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayed("");
    indexRef.current = 0;
    const chars = [...text];
    let lastTime = 0;
    const tick = (now: number) => {
      if (now - lastTime >= speed) {
        lastTime = now;
        if (indexRef.current < chars.length) {
          indexRef.current += 1;
          setDisplayed(chars.slice(0, indexRef.current).join(""));
        }
      }
      if (indexRef.current < chars.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [text, speed]);

  return displayed;
}

/* 单个风格选项按钮 */
function OptionButton({
  option, selected, onSelect,
}: { option: GuessOption; selected: boolean; onSelect: () => void }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: motionDistances.y },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: motionDurations.medium, ease: motionEase.out },
        },
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg"
      >
        <div className={[
          "rounded-lg border px-4 py-3 flex flex-col gap-1",
          "transition-all duration-150",
          selected
            ? "border-blue-400 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-900/15"
            : "border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[oklch(0.18_0.004_265)]",
          "hover:border-zinc-300 dark:hover:border-white/[0.14]",
        ].join(" ")}>
          <div className="flex items-center gap-2">
            {/* 选中指示点 */}
            <span className={[
              "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-150",
              selected ? "bg-blue-500" : "bg-zinc-200 dark:bg-white/20",
            ].join(" ")} />
            <span className={[
              "text-sm font-medium transition-colors duration-150",
              selected
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-800 dark:text-zinc-200",
            ].join(" ")}>
              {option.title}
            </span>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed line-clamp-2 pl-3.5">
            {option.prompt.slice(0, 80)}{option.prompt.length > 80 ? "…" : ""}
          </p>
        </div>
      </button>
    </motion.div>
  );
}

/* 主组件 */
export function GuessRefine({ analysis, onGenerate }: GuessRefineProps) {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<GuessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generateMode, setGenerateMode] = useState<"image" | "video">("image");
  const abortRef = useRef<AbortController | null>(null);
  const typedReply = useTypewriter(result?.reply ?? "", 22);

  const analysisFetchKey = useMemo(
    () => JSON.stringify({
      m: analysis.mainEntity,
      s: analysis.sceneState,
      e: analysis.userEmotion,
      h: analysis.styleHints ?? [],
    }),
    [analysis.mainEntity, analysis.sceneState, analysis.userEmotion, analysis.styleHints]
  );

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    /* eslint-disable react-hooks/set-state-in-effect */
    setStatus("loading");
    setResult(null);
    setSelectedId(null);
    setErrorMsg("");
    /* eslint-enable react-hooks/set-state-in-effect */

    fetch("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis }),
      signal: ac.signal,
    })
      .then((r) => r.json())
      .then((data: { success: boolean; data?: GuessResult; error?: string }) => {
        if (!data.success || !data.data) throw new Error(data.error ?? "决策引擎返回异常");
        setResult(data.data);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setErrorMsg(err instanceof Error ? err.message : "网络错误");
        setStatus("error");
      });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisFetchKey]);

  const selectedOption = result?.options.find((o) => o.id === selectedId) ?? null;

  /* Loading */
  if (status === "loading") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-2.5 py-8"
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">正在生成风格建议…</p>
      </motion.div>
    );
  }

  /* Error */
  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
        分析失败：{errorMsg}
      </div>
    );
  }

  /* Success */
  return (
    <AnimatePresence>
      <motion.div
        key="guess-refine"
        initial={{ opacity: 0, y: motionDistances.y }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: motionDurations.long, ease: motionEase.out }}
        className="flex flex-col gap-4"
      >

        {/* AI 回复气泡 — 白底细边，无毛玻璃 */}
        <motion.div
          initial={{ opacity: 0, y: motionDistances.ySmall }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: motionDurations.medium, ease: motionEase.out }}
          className={[
            "rounded-lg border border-zinc-200 dark:border-white/[0.08]",
            "bg-white dark:bg-[oklch(0.18_0.004_265)]",
            "px-4 py-3.5",
            "shadow-[0_1px_2px_oklch(0_0_0/0.04)]",
          ].join(" ")}
        >
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-2 tracking-wider uppercase">
            AI 分析
          </p>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 min-h-[1.4rem]">
            {typedReply}
            {typedReply.length < (result?.reply.length ?? 0) && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="inline-block w-[1.5px] h-[0.9em] bg-zinc-400 dark:bg-zinc-500 ml-0.5 align-middle"
              />
            )}
          </p>
        </motion.div>

        {/* 三个风格选项 */}
        <motion.div
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: motionStaggers.small, delayChildren: 0.12 } },
          }}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-2"
        >
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">
            选择一个风格方向
          </p>
          {result!.options.map((opt) => (
            <OptionButton
              key={opt.id}
              option={opt}
              selected={selectedId === opt.id}
              onSelect={() => setSelectedId(opt.id)}
            />
          ))}
        </motion.div>

        {/* 主 CTA */}
        <AnimatePresence>
          {selectedOption && (
            <motion.div
              key="cta"
              initial={{ opacity: 0, y: motionDistances.y }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: motionDistances.ySmall }}
              transition={{ duration: motionDurations.medium, ease: motionEase.out }}
              className="flex flex-col gap-2.5 pt-1"
            >
              {/* 生图 / 生视频 切换 */}
              <div className="flex gap-1.5 p-1 rounded-lg bg-zinc-100 dark:bg-white/[0.06]">
                {(["image", "video"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGenerateMode(m)}
                    className={[
                      "flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
                      generateMode === m
                        ? "bg-white dark:bg-[oklch(0.22_0.004_265)] text-zinc-900 dark:text-zinc-100 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400",
                    ].join(" ")}
                  >
                    {m === "image" ? "生成图片" : "生成视频"}
                  </button>
                ))}
              </div>

              {/* 主按钮 — Apple 蓝，无渐变无发光 */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => onGenerate(selectedOption, generateMode)}
                className={[
                  "w-full py-3 rounded-lg",
                  "text-sm font-semibold text-white",
                  "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
                  "dark:bg-blue-500 dark:hover:bg-blue-400",
                  "transition-colors duration-150",
                  "shadow-[0_1px_2px_oklch(0_0_0/0.12)]",
                ].join(" ")}
              >
                生成专属 Drama
                <span className="ml-1.5 text-blue-200 font-normal text-xs">
                  · {selectedOption.title}
                </span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </AnimatePresence>
  );
}
