"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BreathingLoader } from "./breathing-loader";
import { motionDurations, motionEase } from "@/lib/motion";
import type { VisionAnalysis, VisionResponse } from "@/types/vision";

type UploadState = "idle" | "dragging" | "preview" | "sensing" | "error";

interface DragUploadProps {
  onUploadSuccess?: (base64: string) => void;
  onPublicUrlReady?: (publicUrl: string) => void;
  onAnalysisComplete?: (analysis: VisionAnalysis) => void;
  isGuest?: boolean;
  onGuestAttempt?: () => void;
  maxBytes?: number;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function validateFile(file: File, maxBytes: number): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `仅支持 JPG / PNG 格式（当前：${file.type || "未知"}）`;
  }
  if (file.size > maxBytes) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `文件大小 ${mb} MB，超出 ${maxBytes / 1024 / 1024} MB 限制`;
  }
  return null;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

export function DragUpload({
  onUploadSuccess,
  onPublicUrlReady,
  onAnalysisComplete,
  isGuest,
  onGuestAttempt,
  maxBytes = DEFAULT_MAX_BYTES,
}: DragUploadProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [sensingText, setSensingText] = useState("AI 正在分析你的照片...");

  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg("");
      const validationError = validateFile(file, maxBytes);
      if (validationError) {
        setState("error");
        setErrorMsg(validationError);
        return;
      }
      try {
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        setState("preview");

        const base64 = await readAsBase64(file);
        onUploadSuccess?.(base64);

        setState("sensing");

        setSensingText("正在上传并分析...");

        const uploadTask = (async () => {
          try {
            const uploadRes = await fetch("/api/storage/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: base64 }),
            });
            const uploadData = await uploadRes.json() as {
              success: boolean; publicUrl?: string; error?: string;
            };
            if (uploadData.success && uploadData.publicUrl) {
              onPublicUrlReady?.(uploadData.publicUrl);
            } else if (!uploadData.success) {
              console.warn("[DragUpload] Supabase 上传失败：", uploadData.error);
            }
          } catch (e) {
            console.warn("[DragUpload] Supabase 上传异常：", e);
          }
        })();

        const visionTask = (async () => {
          const apiResponse = await fetch("/api/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64 }),
          });
          const result: VisionResponse = await apiResponse.json();
          return result;
        })();

        const [visionResult] = await Promise.all([visionTask, uploadTask]);

        if (!visionResult.success) {
          if (mountedRef.current) setSensingText(`分析失败：${visionResult.error}`);
          await new Promise<void>((r) => setTimeout(r, 1500));
          if (mountedRef.current) {
            setState("error");
            setErrorMsg(visionResult.error);
          }
          return;
        }

        onAnalysisComplete?.(visionResult.data);
        if (mountedRef.current) setState("preview");
      } catch (err) {
        console.error("[DragUpload] 处理异常：", err);
        if (mountedRef.current) {
          setState("error");
          setErrorMsg("上传处理失败，请重试");
        }
      }
    },
    [maxBytes, onUploadSuccess, onPublicUrlReady, onAnalysisComplete]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setState("dragging");
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setState("idle");
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      if (isGuest) {
        onGuestAttempt?.();
        setState("idle");
        return;
      }
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
      else setState("idle");
    },
    [handleFile, isGuest, onGuestAttempt]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isGuest) {
        onGuestAttempt?.();
        e.target.value = "";
        return;
      }
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile, isGuest, onGuestAttempt]
  );

  const handleZoneClick = useCallback(() => {
    if (isGuest) {
      onGuestAttempt?.();
      return;
    }
    if (state === "idle" || state === "error") inputRef.current?.click();
  }, [isGuest, onGuestAttempt, state]);

  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setErrorMsg("");
    dragCounterRef.current = 0;
    setState("idle");
  }, [previewUrl]);

  const panelCls = [
    "relative w-full overflow-hidden rounded-xl",
    "border transition-all duration-150",
    // 默认尽量贴近页面背景，减少“卡片感”
    "bg-transparent",
    state === "idle"
      ? "border-zinc-200/70 dark:border-white/[0.08] cursor-pointer hover:border-zinc-300/80 dark:hover:border-white/[0.14]"
      : state === "dragging"
        ? "border-[var(--apple-blue)] border-2 bg-[oklch(0.96_0.015_250)]/60 dark:bg-[oklch(0.20_0.02_250)]/30 cursor-copy"
        : state === "error"
          ? "border-red-300 dark:border-red-800/50 cursor-pointer"
          : "border-zinc-100/70 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] cursor-default",
  ].join(" ");

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div
        role="button"
        tabIndex={state === "idle" || state === "error" ? 0 : -1}
        aria-label="点击或拖拽图片至此处上传"
        onClick={handleZoneClick}
        onKeyDown={(e) => e.key === "Enter" && handleZoneClick()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={panelCls}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          className="sr-only"
          onChange={handleInputChange}
          aria-hidden="true"
        />

        <AnimatePresence mode="wait">

          {/* idle / dragging */}
          {(state === "idle" || state === "dragging") && (
            <motion.div
              key="idle"
              className="flex flex-col items-center justify-center gap-4 py-14 px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <motion.div
                animate={state === "dragging" ? { scale: 1.1 } : { scale: 1 }}
                transition={{ duration: 0.15 }}
                className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-white/[0.07] flex items-center justify-center"
              >
                <svg
                  width="17" height="17" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round"
                  className="text-zinc-400 dark:text-zinc-500" aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
              </motion.div>
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {state === "dragging" ? "松开以上传" : (
                    <>
                      <span
                        className={[
                          "inline-flex items-center justify-center",
                          "h-9 px-4 rounded-lg",
                          "border border-[color:var(--apple-blue)]",
                          "bg-[oklch(0.97_0.015_250)]/70 dark:bg-[oklch(0.20_0.02_250)]/35",
                          "text-[color:var(--apple-blue)] font-semibold",
                          "shadow-sm",
                        ].join(" ")}
                      >
                        选择照片开始
                      </span>
                      <span className="ml-2 text-zinc-500 dark:text-zinc-500">或拖拽到这里</span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-zinc-400/80 dark:text-zinc-500">
                  支持 JPG/PNG · ≤ 5MB
                </p>
              </div>
            </motion.div>
          )}

          {/* error */}
          {state === "error" && (
            <motion.div
              key="error"
              className="flex flex-col items-center justify-center gap-3 py-14 px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="w-9 h-9 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round"
                  className="text-red-400" aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-snug">
                  {errorMsg}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReset(); }}
                  className="text-xs text-blue-500 dark:text-blue-400 hover:underline transition-colors"
                >
                  重新选择
                </button>
              </div>
            </motion.div>
          )}

          {/* preview / sensing */}
          {(state === "preview" || state === "sensing") && previewUrl && (
            <motion.div
              key="preview"
              className="relative w-full"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionDurations.medium, ease: motionEase.out }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="上传的图片"
                className="w-full object-cover rounded-xl"
                style={{ maxHeight: "400px", objectPosition: "center" }}
              />
              <AnimatePresence>
                {state === "sensing" && (
                  <motion.div
                    key="sensing-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: motionDurations.short, ease: motionEase.out }}
                    className={[
                      "absolute inset-0 rounded-xl",
                      "bg-white/40 dark:bg-black/20",
                      "backdrop-blur-[2px]",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                )}
              </AnimatePresence>
              {state === "preview" && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleReset(); }}
                  className={[
                    "absolute top-2.5 right-2.5 w-7 h-7 rounded-full",
                    "bg-black/25 backdrop-blur-md",
                    "flex items-center justify-center",
                    "text-white/80 hover:text-white hover:bg-black/40",
                    "transition-colors duration-150",
                  ].join(" ")}
                  aria-label="重新选择图片"
                >
                  <svg
                    width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      <AnimatePresence>
        {state === "sensing" && <BreathingLoader text={sensingText} />}
      </AnimatePresence>
    </div>
  );
}
