"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BreathingLoader } from "./breathing-loader";
import { motionDurations, motionEase } from "@/lib/motion";
import type { VisionAnalysis, VisionResponse } from "@/types/vision";

type UploadState = "idle" | "dragging" | "preview" | "sensing" | "error" | "unsupported";
type UnsupportedCategory = "video" | "url" | "other";

interface DragUploadProps {
  onUploadSuccess?: (base64: string) => void;
  onPublicUrlReady?: (publicUrl: string) => void;
  onPublicUrlFailed?: (error: string) => void;
  onAnalysisComplete?: (analysis: VisionAnalysis) => void;
  isGuest?: boolean;
  onGuestAttempt?: () => void;
  maxBytes?: number;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const RESIZE_MAX_PX = 1280;
const TARGET_BASE64_CHARS = 2.5 * 1024 * 1024;

// All UI text as JS constants so Unicode escapes are processed correctly
const T = {
  sensing:    "AI \u6B63\u5728\u5206\u6790\u4F60\u7684\u7167\u7247...",
  optimizing: "\u6B63\u5728\u4F18\u5316\u56FE\u7247\u5927\u5C0F\u2026",
  uploading:  "\u6B63\u5728\u4E0A\u4F20\u5E76\u5206\u6790...",
  release:    "\u677E\u5F00\u4EE5\u4E0A\u4F20",
  choose:     "\u9009\u62E9\u7167\u7247\u5F00\u59CB",
  or:         "\u6216\u62D6\u62FD\u5230\u8FD9\u91CC",
  hint:       "\u652F\u6301 JPG / PNG \u6700\u5927 10MB",
  retry:      "\u91CD\u65B0\u9009\u62E9",
  retryImg:   "\u91CD\u65B0\u9009\u62E9\u56FE\u7247",
  videoTitle: "\u89C6\u9891\u573A\u666F\uFF0C\u5373\u5C06\u4E0A\u7EBF",
  urlTitle:   "\u94FE\u63A5\u8F93\u5165\uFF0C\u5373\u5C06\u4E0A\u7EBF",
  videoHint:  "\u5F53\u524D\u652F\u6301\u56FE\u7247\u5F00\u542F Drama \u00B7 \u622A\u4E00\u5E27\u4E0A\u4F20\u6548\u679C\u4E00\u6837\u597D",
  urlHint:    "\u5F53\u524D\u53EF\u622A\u56FE\u4E0A\u4F20 \u00B7 \u6548\u679C\u548C\u94FE\u63A5\u4E00\u6837",
  uploadFail: "\u4E0A\u4F20\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
  ariaLabel:  "\u70B9\u51FB\u6216\u62D6\u62FD\u56FE\u7247\u81F3\u6B64\u5904\u4E0A\u4F20",
  imgAlt:     "\u4E0A\u4F20\u7684\u56FE\u7247",
  closeAlt:   "\u91CD\u65B0\u9009\u62E9\u56FE\u7247",
};

function detectFileCategory(file: File): UnsupportedCategory | null {
  if (ALLOWED_TYPES.includes(file.type)) return null;
  if (file.type.startsWith("video/") || /\.(mp4|mov|webm|avi|mkv|flv|wmv)$/i.test(file.name)) {
    return "video";
  }
  return "other";
}

function validateFile(file: File, maxBytes: number): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `\u4EC5\u652F\u6301 JPG / PNG / WebP \u683C\u5F0F\uFF08\u5F53\u524D\uFF1A${file.type || "\u672A\u77E5"}\uFF09`;
  }
  if (file.size > maxBytes) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `\u6587\u4EF6\u5927\u5C0F ${mb} MB\uFF0C\u8D85\u51FA ${maxBytes / 1024 / 1024} MB \u9650\u5236`;
  }
  return null;
}

function detectUrlDrop(dt: DataTransfer): boolean {
  if (dt.files.length > 0) return false;
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i];
    if (item.kind === "string" && (item.type === "text/uri-list" || item.type === "text/plain")) {
      return true;
    }
  }
  return false;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

async function resizeToBase64(raw: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const maxPx = RESIZE_MAX_PX;
      let tw = w;
      let th = h;
      if (w > maxPx || h > maxPx) {
        const ratio = Math.min(maxPx / w, maxPx / h);
        tw = Math.round(w * ratio);
        th = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(raw); return; }
      ctx.drawImage(img, 0, 0, tw, th);
      let out = canvas.toDataURL("image/jpeg", 0.88);
      if (out.length > TARGET_BASE64_CHARS) {
        out = canvas.toDataURL("image/jpeg", 0.72);
      }
      resolve(out);
    };
    img.onerror = () => resolve(raw);
    img.src = raw;
  });
}

export function DragUpload({
  onUploadSuccess,
  onPublicUrlReady,
  onPublicUrlFailed,
  onAnalysisComplete,
  isGuest,
  onGuestAttempt,
  maxBytes = DEFAULT_MAX_BYTES,
}: DragUploadProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [sensingText, setSensingText] = useState("AI ...");
  const [unsupportedCategory, setUnsupportedCategory] = useState<UnsupportedCategory>("other");

  const dragCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    setSensingText(T.sensing);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg("");
      const category = detectFileCategory(file);
      if (category !== null) {
        setUnsupportedCategory(category);
        setState("unsupported");
        return;
      }
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

        const rawBase64 = await readAsBase64(file);
        setSensingText(T.optimizing);
        const base64 = await resizeToBase64(rawBase64);
        onUploadSuccess?.(base64);

        setState("sensing");
        setSensingText(T.uploading);

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
              console.warn("[DragUpload] Supabase upload failed:", uploadData.error);
              onPublicUrlFailed?.(uploadData.error ?? "Supabase 上传失败");
            }
          } catch (e) {
            console.warn("[DragUpload] Supabase upload exception:", e);
            onPublicUrlFailed?.(e instanceof Error ? e.message : "Supabase 上传异常");
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
          const failMsg = `\u5206\u6790\u5931\u8D25\uFF1A${visionResult.error}`;
          if (mountedRef.current) setSensingText(failMsg);
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
        console.error("[DragUpload] exception:", err);
        if (mountedRef.current) {
          setState("error");
          setErrorMsg(T.uploadFail);
        }
      }
    },
    [maxBytes, onUploadSuccess, onPublicUrlReady, onPublicUrlFailed, onAnalysisComplete]
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
      if (detectUrlDrop(e.dataTransfer)) {
        setUnsupportedCategory("url");
        setState("unsupported");
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
    if (state === "idle" || state === "error" || state === "unsupported") inputRef.current?.click();
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
    "bg-transparent",
    state === "idle"
      ? "border-zinc-200/70 dark:border-white/[0.08] cursor-pointer hover:border-zinc-300/80 dark:hover:border-white/[0.14]"
      : state === "dragging"
        ? "border-[var(--apple-blue)] border-2 bg-[oklch(0.96_0.015_250)]/60 dark:bg-[oklch(0.20_0.02_250)]/30 cursor-copy"
        : state === "error"
          ? "border-red-300 dark:border-red-800/50 cursor-pointer"
          : state === "unsupported"
            ? "border-amber-300/70 dark:border-amber-700/40 cursor-pointer"
            : "border-zinc-100/70 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] cursor-default",
  ].join(" ");

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div
        role="button"
        tabIndex={state === "idle" || state === "error" || state === "unsupported" ? 0 : -1}
        aria-label={T.ariaLabel}
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
                  {state === "dragging" ? T.release : (
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
                        {T.choose}
                      </span>
                      <span className="ml-2 text-zinc-500 dark:text-zinc-500">{T.or}</span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-zinc-400/80 dark:text-zinc-500">
                  {T.hint}
                </p>
              </div>
            </motion.div>
          )}

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
                  {T.retry}
                </button>
              </div>
            </motion.div>
          )}

          {state === "unsupported" && (
            <motion.div
              key="unsupported"
              className="flex flex-col items-center justify-center gap-3 py-14 px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
                {unsupportedCategory === "video" ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500" aria-hidden="true">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
              </div>
              <div className="flex flex-col items-center gap-1.5 text-center">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {unsupportedCategory === "video" ? T.videoTitle : T.urlTitle}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed max-w-[200px]">
                  {unsupportedCategory === "video" ? T.videoHint : T.urlHint}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReset(); }}
                  className="mt-0.5 text-xs text-blue-500 dark:text-blue-400 hover:underline transition-colors"
                >
                  {T.retryImg}
                </button>
              </div>
            </motion.div>
          )}

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
                alt={T.imgAlt}
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
                  aria-label={T.closeAlt}
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