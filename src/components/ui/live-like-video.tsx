"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LIVE_DURATION_MS_DEFAULT = 2000;

type Props = {
  src: string;
  className?: string;
  videoClassName?: string;
  liveDurationMs?: number;
  /** 传入后，右下角显示"查看原图"按钮，点击触发大图预览 */
  onViewFull?: () => void;
  page: "plaza" | "create" | "post-detail";
  slot: string;
};

export function LiveLikeVideo({
  src,
  className = "",
  videoClassName = "",
  liveDurationMs = LIVE_DURATION_MS_DEFAULT,
  onViewFull,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setIsPlaying(false);
  }, []);

  const handlePress = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      stop();
      return;
    }
    v.currentTime = 0;
    const playPromise = v.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }
    setIsPlaying(true);
    timerRef.current = setTimeout(stop, liveDurationMs);
  }, [isPlaying, liveDurationMs, stop]);

  const handleEnded = useCallback(() => {
    stop();
  }, [stop]);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0.01;
  }, []);

  useEffect(() => {
    stop();
  }, [src, stop]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl select-none cursor-pointer",
        "border border-zinc-200/30 dark:border-white/[0.08]",
        "bg-zinc-100 dark:bg-white/[0.04]",
        className,
      ].join(" ")}
      onClick={handlePress}
      role="button"
      tabIndex={0}
      aria-label="点击播放 Live 图"
      onKeyDown={(e) => e.key === "Enter" && handlePress()}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className={["absolute inset-0 w-full h-full", videoClassName].join(" ")}
        aria-hidden="true"
      />

      {/* LIVE 徽标 — 右上角 */}
      <div
        className={[
          "absolute top-2 right-2 z-10",
          "flex items-center gap-[3px]",
          "px-1.5 py-[2px] rounded-[4px]",
          "bg-white/85 dark:bg-black/55",
          "backdrop-blur-[2px]",
          isPlaying ? "opacity-100" : "opacity-75",
          "transition-opacity duration-150",
        ].join(" ")}
        aria-hidden="true"
      >
        <span
          className={[
            "w-1.5 h-1.5 rounded-full shrink-0",
            isPlaying ? "bg-red-500 animate-pulse" : "bg-zinc-400 dark:bg-zinc-500",
          ].join(" ")}
        />
        <span
          className={[
            "text-[10px] font-semibold tracking-wide leading-none",
            isPlaying ? "text-red-500" : "text-zinc-500 dark:text-zinc-400",
          ].join(" ")}
        >
          LIVE
        </span>
      </div>

      {/* 查看大图按钮 — 左下角，仅静止且有 onViewFull 时显示 */}
      {onViewFull && !isPlaying && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewFull();
          }}
          className={[
            "absolute bottom-2 left-2 z-10",
            "flex items-center gap-1",
            "px-2 py-1 rounded-md",
            "bg-black/30 hover:bg-black/45 backdrop-blur-[2px]",
            "text-[10px] font-medium text-white/90",
            "transition-colors duration-150",
          ].join(" ")}
          aria-label="查看大图"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          查看大图
        </button>
      )}

      {/* hover 播放提示 — 静止时中心显示 */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-150 pointer-events-none"
          aria-hidden="true"
        >
          <div className="bg-black/30 rounded-full p-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
