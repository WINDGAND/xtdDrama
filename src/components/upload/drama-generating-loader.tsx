"use client";

/**
 * DramaGeneratingLoader — 生图等待期动画
 *
 * 三部分组成：
 *   1. 3 步进度指示器（已提交 → 渲染中 → 完成）
 *   2. 像素律动条 —— 5 根竖条 scaleY 随机律动，Claude Code 风格
 *   3. 轮换文案 + 秒级计时器
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type GeneratingStatus = "submitting" | "polling" | "completed" | "failed";

interface DramaGeneratingLoaderProps {
  status: GeneratingStatus;
}

const ROTATING_COPY = [
  "AI 正在把日常改写成史诗…",
  "画笔已经拿起来了…",
  "材质戏剧化处理中…",
  "正在进行情绪夸张处理…",
  "结构保留中，仅更换宇宙观…",
  "AI 正在发疯，请稍候…",
  "把你的倒霉变成名场面中…",
];

const STEPS = [
  { id: "submit", label: "已提交" },
  { id: "render", label: "渲染中" },
  { id: "done",   label: "完成"   },
] as const;

function getActiveStep(status: GeneratingStatus): number {
  if (status === "submitting") return 0;
  if (status === "polling")    return 1;
  if (status === "completed")  return 2;
  return 1;
}

/* -------- 像素律动条 -------- */
const BAR_DELAYS = ["0s", "0.15s", "0.3s", "0.45s", "0.6s"];
const BAR_DURATIONS = ["0.7s", "0.5s", "0.8s", "0.6s", "0.55s"];

function PixelBars() {
  return (
    <div className="flex items-end gap-[3px] h-7" aria-hidden="true">
      {BAR_DELAYS.map((delay, i) => (
        <span
          key={i}
          className="w-[5px] rounded-sm bg-blue-400/70 dark:bg-blue-500/60"
          style={{
            height: "100%",
            transformOrigin: "bottom",
            animation: `dramaBar ${BAR_DURATIONS[i]} ${delay} ease-in-out infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes dramaBar {
          0%   { transform: scaleY(0.15); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

/* -------- 步骤指示器 -------- */
function StepIndicator({ status }: { status: GeneratingStatus }) {
  const active = getActiveStep(status);

  /*
   * 布局结构：节点 — 线 — 节点 — 线 — 节点
   * 节点 shrink-0，两条线各自 flex-1 撑满剩余空间，
   * 保证首尾节点贴边、三点均分整行宽度。
   */
  return (
    <div className="flex items-start w-full">
      {STEPS.map((step, i) => {
        const isDone    = i < active;
        const isCurrent = i === active && status !== "completed";
        const isLast    = i === STEPS.length - 1;

        return (
          <div key={step.id} className="contents">
            {/* 节点 */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={[
                  "w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300",
                  isDone
                    ? "bg-blue-500 dark:bg-blue-400"
                    : isCurrent
                      ? "bg-blue-500 dark:bg-blue-400 ring-4 ring-blue-100 dark:ring-blue-900/40"
                      : "bg-zinc-200 dark:bg-zinc-700",
                ].join(" ")}
              >
                {isDone ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2 5.5L4 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : isCurrent ? (
                  <motion.span
                    className="w-2 h-2 rounded-full bg-white"
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                )}
              </div>
              <span
                className={[
                  "text-[10px] font-medium whitespace-nowrap transition-colors duration-300",
                  isDone || isCurrent
                    ? "text-blue-500 dark:text-blue-400"
                    : "text-zinc-400 dark:text-zinc-600",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {/* 连接线：节点之间撑满剩余空间，与节点垂直居中对齐（mt 对齐圆心） */}
            {!isLast && (
              <div className="flex-1 mx-1.5 mt-[9px]">
                <div
                  className={[
                    "h-[1.5px] w-full rounded-full transition-all duration-500",
                    isDone ? "bg-blue-400 dark:bg-blue-500" : "bg-zinc-200 dark:bg-zinc-700",
                  ].join(" ")}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------- 轮换文案 -------- */
function RotatingCopy() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % ROTATING_COPY.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="h-5 overflow-hidden relative">
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="text-xs text-zinc-500 dark:text-zinc-400 text-center absolute inset-x-0"
        >
          {ROTATING_COPY[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/* -------- 计时器 -------- */
function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">
      已等待 {mm}:{ss}
    </p>
  );
}

/* -------- 主组件 -------- */
export function DramaGeneratingLoader({ status }: DramaGeneratingLoaderProps) {
  const startedAtRef = useRef(Date.now());

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-4 w-full py-4 px-2"
    >
      {/* 步骤指示器 */}
      <StepIndicator status={status} />

      {/* 像素律动条 */}
      <PixelBars />

      {/* 轮换文案 */}
      <RotatingCopy />

      {/* 计时器 */}
      <ElapsedTimer startedAt={startedAtRef.current} />
    </motion.div>
  );
}
