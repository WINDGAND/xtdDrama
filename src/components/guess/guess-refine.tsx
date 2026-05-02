"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { motionDurations, motionEase, motionDistances, motionStaggers } from "@/lib/motion";
import type { VisionAnalysis } from "@/types/vision";
import type { GuessOption, GuessOptionSignature, GuessResult } from "@/types/guess";
import { emitGuessMetric } from "@/lib/guess-observability";

const MAX_BATCH = 3;

/* ---- 稳定的 variants 常量（提升到模块顶层，避免每次 render 创建新对象引用导致 Framer Motion 重跑动画） ---- */
const OPTION_ROW_VARIANTS = {
  hidden: { opacity: 0, y: motionDistances.y },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: motionDurations.medium, ease: motionEase.out },
  },
} as const;

const OPTIONS_LIST_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: motionStaggers.small, delayChildren: 0.12 } },
} as const;

/* -------- Guess 阶段专属 loading -------- */
const GUESS_COPY = [
  "正在根据你的日常碎片匹配风格…",
  "已确认：这张图确实很有戏",
  "选项生成中，请做好 Drama 准备…",
  "AI 正在发散思维，稍等…",
  "戏剧化方向计算中…",
];

const GUESS_BAR_DELAYS  = ["0s", "0.2s", "0.1s", "0.25s", "0.05s"];
const GUESS_BAR_HEIGHTS = ["60%", "100%", "75%", "90%", "50%"];

function GuessLoader({ copy }: { copy?: string }) {
  const [copyIdx, setCopyIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCopyIdx((prev) => (prev + 1) % GUESS_COPY.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-3 py-7"
    >
      <div className="flex items-end gap-[3px] h-6" aria-hidden="true">
        {GUESS_BAR_DELAYS.map((delay, i) => (
          <span
            key={i}
            className="w-[4px] rounded-sm bg-zinc-300 dark:bg-zinc-600"
            style={{
              height: GUESS_BAR_HEIGHTS[i],
              transformOrigin: "bottom",
              animation: `guessBar 0.55s ${delay} ease-in-out infinite alternate`,
            }}
          />
        ))}
        <style>{`
          @keyframes guessBar {
            0%   { transform: scaleY(0.2); }
            100% { transform: scaleY(1); }
          }
        `}</style>
      </div>

      <div className="h-4 overflow-hidden relative w-full max-w-[220px]">
        <AnimatePresence mode="wait">
          <motion.p
            key={copy ?? copyIdx}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-xs text-zinc-400 dark:text-zinc-500 text-center absolute inset-x-0"
          >
            {copy ?? GUESS_COPY[copyIdx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export interface GuessRefineProps {
  analysis: VisionAnalysis;
  onGenerate: (option: GuessOption, mode: "image" | "video") => void;
  isGenerating?: boolean;
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

/* 轴类型标签映射（id=1 史诗感 / id=2 手绘感 / id=3 胶片感） */
const AXIS_TAG_MAP: Record<number, { label: string; emoji: string }> = {
  1: { label: "史诗感", emoji: "🎬" },
  2: { label: "手绘感", emoji: "✏️" },
  3: { label: "胶片感", emoji: "📷" },
};

/* 单个风格选项行（平铺列表，无卡片边框） */
function OptionRow({
  option, selected, isFirst, onSelect,
}: { option: GuessOption; selected: boolean; isFirst: boolean; onSelect: () => void }) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const axisTag = AXIS_TAG_MAP[option.id];

  return (
    <motion.div variants={OPTION_ROW_VARIANTS}>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === "Enter" && onSelect()}
        className={[
          "flex items-start gap-2.5 py-3 -mx-1 px-1 rounded",
          !isFirst && "border-t border-zinc-100 dark:border-white/[0.06]",
          "transition-colors duration-150 cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
          selected
            ? "bg-blue-50/40 dark:bg-blue-900/10"
            : "hover:bg-zinc-50 dark:hover:bg-white/[0.03]",
        ].join(" ")}
      >
        {/* 选中状态：左侧 2px 蓝色竖线；未选中时透明占位 */}
        <span className={[
          "mt-0.5 w-[2px] self-stretch rounded-full flex-shrink-0 transition-colors duration-150",
          selected ? "bg-blue-500" : "bg-transparent",
        ].join(" ")} />

        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={[
              "text-sm font-medium transition-colors duration-150",
              selected
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-800 dark:text-zinc-200",
            ].join(" ")}>
              {option.title}
            </span>
            {axisTag && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.07] text-zinc-500 dark:text-zinc-400 shrink-0">
                {axisTag.emoji} {axisTag.label}
              </span>
            )}
          </div>

          {option.description ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {option.description}
            </p>
          ) : null}

          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPromptExpanded((v) => !v)}
              className="text-[11px] text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors duration-150 underline-offset-2 hover:underline"
            >
              {promptExpanded ? "收起提示词" : "查看提示词原文"}
            </button>
            {promptExpanded && (
              <p className="mt-1.5 text-[11px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed break-all whitespace-pre-wrap">
                {option.prompt}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* 主组件 */
export function GuessRefine({ analysis, onGenerate, isGenerating = false }: GuessRefineProps) {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<GuessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generateMode, setGenerateMode] = useState<"image" | "video">("image");
  const abortRef = useRef<AbortController | null>(null);
  const ctaRef = useRef<HTMLDivElement | null>(null);
  const typedReply = useTypewriter(result?.reply ?? "", 22);

  // 换一批状态
  const [batchIndex, setBatchIndex] = useState(1);
  const [historySignatures, setHistorySignatures] = useState<GuessOptionSignature[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 我自己说一句状态
  const [hintOpen, setHintOpen] = useState(false);
  const [userHint, setUserHint] = useState("");
  const [isHintSubmitting, setIsHintSubmitting] = useState(false);
  const hintInputRef = useRef<HTMLInputElement | null>(null);

  const analysisFetchKey = useMemo(
    () => JSON.stringify({
      m: analysis.mainEntity,
      s: analysis.sceneState,
      e: analysis.userEmotion,
      h: analysis.styleHints ?? [],
    }),
    [analysis.mainEntity, analysis.sceneState, analysis.userEmotion, analysis.styleHints]
  );

  /* ---- 核心 fetch 函数 ---- */
  const fetchGuess = useCallback(async (
    signal: AbortSignal,
    opts: {
      exclude?: GuessOptionSignature[];
      batchIndex?: number;
      userHint?: string;
      mode?: "recommend" | "direct";
    } = {}
  ): Promise<{ result: GuessResult; meta?: { batchIndex: number; dedupLevel: string } }> => {
    const res = await fetch("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis,
        ...(opts.exclude?.length ? { exclude: opts.exclude } : {}),
        ...(opts.batchIndex ? { batchIndex: opts.batchIndex } : {}),
        ...(opts.userHint ? { userHint: opts.userHint } : {}),
        ...(opts.mode ? { mode: opts.mode } : {}),
      }),
      signal,
    });
    const data = (await res.json()) as {
      success: boolean;
      data?: GuessResult;
      meta?: { batchIndex: number; dedupLevel: string };
      error?: string;
    };
    if (!data.success || !data.data) throw new Error(data.error ?? "决策引擎返回异常");
    return { result: data.data, meta: data.meta };
  }, [analysis]);

  /* ---- 初始加载 ---- */
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    /* eslint-disable react-hooks/set-state-in-effect */
    setStatus("loading");
    setResult(null);
    setSelectedId(null);
    setErrorMsg("");
    setBatchIndex(1);
    setHistorySignatures([]);
    setHintOpen(false);
    setUserHint("");
    /* eslint-enable react-hooks/set-state-in-effect */

    fetchGuess(ac.signal)
      .then(({ result: r }) => {
        setResult(r);
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

  /* ---- 换一批 ---- */
  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !result) return;
    emitGuessMetric("guess_batch_refresh_click", { batchIndex });
    setIsRefreshing(true);
    setSelectedId(null);

    const newSignatures: GuessOptionSignature[] = [
      ...historySignatures,
      ...result.options.map((o) => ({ title: o.title, prompt: o.prompt, description: o.description })),
    ];
    const nextBatch = batchIndex + 1;

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    try {
      const { result: newResult, meta } = await fetchGuess(ac.signal, {
        exclude: newSignatures,
        batchIndex: nextBatch,
      });
      emitGuessMetric("guess_batch_refresh_success", {
        batchIndex: nextBatch,
        dedupLevel: meta?.dedupLevel,
      });
      setHistorySignatures(newSignatures);
      setBatchIndex(nextBatch);
      setResult(newResult);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      // 换批失败不崩溃，保留当前结果
    } finally {
      setIsRefreshing(false);
    }
  }, [batchIndex, fetchGuess, historySignatures, isRefreshing, result]);

  /* ---- 我自己说一句：影响推荐 ---- */
  const handleHintRecommend = useCallback(async () => {
    const hint = userHint.trim();
    if (!hint || isHintSubmitting) return;
    emitGuessMetric("guess_custom_hint_submit", { batchIndex, hasUserHint: true });
    setIsHintSubmitting(true);
    setSelectedId(null);

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    try {
      const { result: newResult } = await fetchGuess(ac.signal, {
        exclude: historySignatures,
        batchIndex: batchIndex + 1,
        userHint: hint,
        mode: "recommend",
      });
      setHistorySignatures((prev) => [
        ...prev,
        ...(result?.options ?? []).map((o) => ({ title: o.title, prompt: o.prompt, description: o.description })),
      ]);
      setBatchIndex((v) => v + 1);
      setResult(newResult);
      setHintOpen(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setIsHintSubmitting(false);
    }
  }, [batchIndex, fetchGuess, historySignatures, isHintSubmitting, result, userHint]);

  /* ---- 我自己说一句：直接生成 ---- */
  const handleHintDirect = useCallback(async () => {
    const hint = userHint.trim();
    if (!hint || isHintSubmitting || isGenerating) return;
    emitGuessMetric("guess_custom_direct_generate", { batchIndex, hasUserHint: true });
    setIsHintSubmitting(true);

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    try {
      const { result: directResult } = await fetchGuess(ac.signal, {
        userHint: hint,
        mode: "direct",
      });
      const singleOption = directResult.options[0];
      if (singleOption) {
        onGenerate(singleOption, generateMode);
        setHintOpen(false);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setIsHintSubmitting(false);
    }
  }, [fetchGuess, generateMode, isGenerating, isHintSubmitting, onGenerate, userHint]);

  const selectedOption = result?.options.find((o) => o.id === selectedId) ?? null;
  const hintValid = userHint.trim().length >= 2 && userHint.trim().length <= 40;
  const showRefresh = batchIndex < MAX_BATCH && !isRefreshing;
  const showHintSuggestion = batchIndex >= MAX_BATCH && !hintOpen;

  /* Loading */
  if (status === "loading") {
    return <GuessLoader />;
  }

  /* Error */
  if (status === "error") {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
        分析失败：{errorMsg}
      </div>
    );
  }

  /* 换批加载中 */
  if (isRefreshing) {
    return <GuessLoader copy="正在换一批风格…" />;
  }

  /* Success */
  return (
    <AnimatePresence>
      <motion.div
        key={`guess-refine-batch-${batchIndex}`}
        initial={{ opacity: 0, y: motionDistances.y }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: motionDurations.long, ease: motionEase.out }}
        className="flex flex-col gap-4"
      >

        {/* AI 分析（平铺，无卡片容器） */}
        <motion.div
          initial={{ opacity: 0, y: motionDistances.ySmall }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: motionDurations.medium, ease: motionEase.out }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-widest uppercase">
              AI 分析
            </p>
            {batchIndex > 1 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">
                第 {batchIndex} 批
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 min-h-[1.4rem]">
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

        {/* 三个风格选项（平铺列表，divider 分隔） */}
        <motion.div
          variants={OPTIONS_LIST_VARIANTS}
          initial="hidden"
          animate="visible"
          className="flex flex-col"
        >
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
            选择一个风格方向
          </p>
          {result!.options.map((opt, i) => (
            <OptionRow
              key={opt.id}
              option={opt}
              selected={selectedId === opt.id}
              isFirst={i === 0}
              onSelect={() => {
                setSelectedId(opt.id);
                emitGuessMetric("guess_option_selected", { batchIndex, optionTitle: opt.title });
                requestAnimationFrame(() => {
                  ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                });
              }}
            />
          ))}
        </motion.div>

        {/* 换一批 / 提示引导 */}
        <div className="flex items-center gap-3 flex-wrap">
          {showRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isGenerating}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              没感觉？换一批
            </button>
          )}
          {showHintSuggestion && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              三批都不合适？
              <button
                type="button"
                onClick={() => {
                  emitGuessMetric("guess_custom_hint_open", { batchIndex });
                  setHintOpen(true);
                  requestAnimationFrame(() => hintInputRef.current?.focus());
                }}
                className="ml-1 text-[color:var(--apple-blue)] hover:underline"
              >
                告诉 AI 你的想法
              </button>
            </p>
          )}
          {!showRefresh && !showHintSuggestion && !hintOpen && (
            <button
              type="button"
              onClick={() => {
                emitGuessMetric("guess_custom_hint_open", { batchIndex });
                setHintOpen(true);
                requestAnimationFrame(() => hintInputRef.current?.focus());
              }}
              className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors duration-150"
            >
              说说你的偏好
            </button>
          )}
        </div>

        {/* 我自己说一句 输入区（平铺，无外层卡片容器） */}
        <AnimatePresence>
          {hintOpen && (
            <motion.div
              key="hint-area"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="border-t border-zinc-100 dark:border-white/[0.06] pt-3 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                  说说你的偏好
                </p>
                <button
                  type="button"
                  onClick={() => { setHintOpen(false); setUserHint(""); }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  取消
                </button>
              </div>

              <div className="relative">
                <input
                  ref={hintInputRef}
                  type="text"
                  value={userHint}
                  onChange={(e) => setUserHint(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && hintValid && !isHintSubmitting) {
                      e.preventDefault();
                      handleHintRecommend();
                    }
                  }}
                  placeholder="比如：复古但别太暗、帮我走治愈系一点"
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-sm",
                    "border-zinc-200/80 dark:border-white/[0.10]",
                    "bg-white dark:bg-white/[0.02]",
                    "text-zinc-800 dark:text-zinc-100",
                    "placeholder:text-zinc-400 dark:placeholder:text-zinc-600",
                    "outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]",
                    "transition-shadow duration-150",
                  ].join(" ")}
                />
                {userHint.length > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400 tabular-nums pointer-events-none">
                    {userHint.trim().length}/40
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleHintRecommend}
                  disabled={!hintValid || isHintSubmitting}
                  className={[
                    "flex-1 py-2 rounded-lg text-xs font-medium",
                    "border border-zinc-200/80 dark:border-white/[0.10]",
                    "bg-white dark:bg-white/[0.02]",
                    "text-zinc-700 dark:text-zinc-200",
                    "hover:bg-zinc-50 dark:hover:bg-white/[0.05]",
                    "transition-colors duration-150",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                >
                  {isHintSubmitting ? "重新推荐中…" : "基于此重新推荐"}
                </button>
                <button
                  type="button"
                  onClick={handleHintDirect}
                  disabled={!hintValid || isHintSubmitting || isGenerating}
                  className={[
                    "flex-1 py-2 rounded-lg text-xs font-semibold text-white",
                    "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
                    "dark:bg-blue-500 dark:hover:bg-blue-400",
                    "transition-colors duration-150",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                >
                  {isHintSubmitting ? "生成中…" : "直接按这句话生成"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 主 CTA */}
        <AnimatePresence>
          {selectedOption && (
            <motion.div
              ref={ctaRef}
              key="cta"
              initial={{ opacity: 0, y: motionDistances.y }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: motionDistances.ySmall }}
              transition={{ duration: motionDurations.medium, ease: motionEase.out }}
              className="flex flex-col gap-2.5 pt-1"
            >
              {/* 生图 / 生 Live 图 切换 */}
              <div className="flex gap-1.5 p-1 rounded-lg bg-zinc-100 dark:bg-white/[0.06]">
                {(["image", "video"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setGenerateMode(m)}
                    className={[
                      "flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
                      generateMode === m
                        ? "bg-white dark:bg-[oklch(0.22_0.004_265)] text-zinc-900 dark:text-zinc-100 shadow-sm"
                        : "text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400",
                      isGenerating ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    {m === "image" ? "生成图片" : "生成 Live 图"}
                  </button>
                ))}
              </div>

              {/* 主按钮 */}
              <motion.button
                type="button"
                whileTap={isGenerating ? undefined : { scale: 0.98 }}
                disabled={isGenerating}
                onClick={() => !isGenerating && onGenerate(selectedOption, generateMode)}
                className={[
                  "w-full py-3 rounded-lg",
                  "text-sm font-semibold text-white",
                  "transition-colors duration-200",
                  "shadow-[0_1px_2px_oklch(0_0_0/0.12)]",
                  isGenerating
                    ? "bg-zinc-400 dark:bg-zinc-600 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400",
                ].join(" ")}
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="flex gap-[3px] items-center" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-[4px] h-[4px] rounded-full bg-white/70"
                          style={{ animation: `ctaDot 1s ${i * 0.18}s ease-in-out infinite alternate` }}
                        />
                      ))}
                      <style>{`
                        @keyframes ctaDot {
                          0%   { opacity: 0.3; transform: scaleY(0.6); }
                          100% { opacity: 1;   transform: scaleY(1.2); }
                        }
                      `}</style>
                    </span>
                    正在 Drama 中…
                  </span>
                ) : (
                  <>
                    生成专属 Drama
                    <span className="ml-1.5 text-blue-200 font-normal text-xs">
                      · {selectedOption.title}
                    </span>
                  </>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </AnimatePresence>
  );
}
