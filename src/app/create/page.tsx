"use client";

import dynamic from "next/dynamic";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toast } from "@/components/ui/toast";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { requestLogin } from "@/lib/request-login";
import { DramaGeneratingLoader } from "@/components/upload/drama-generating-loader";
import type { VisionAnalysis, VisionResponse } from "@/types/vision";
import type { GuessOption } from "@/types/guess";
import { useAuth } from "@/components/providers/auth-provider";
import ProfilePic1 from "@/../images/ProfilePic1.jpg";
import ProfilePic2 from "@/../images/ProfilePic2.jpg";
import ProfilePic3 from "@/../images/ProfilePic3.jpg";
import ProfilePic4 from "@/../images/ProfilePic4.jpg";
import ProfilePic5 from "@/../images/ProfilePic5.jpg";

/* -------- Vision 等待态 loader -------- */
const VISION_COPY = [
  "AI 正在扫描你的图…",
  "识别场景与情绪中…",
  "感知层运行中，请稍等…",
];

const VISION_BAR_DELAYS = ["0s", "0.18s", "0.09s", "0.27s", "0.05s"];

function VisionScanLoader() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % VISION_COPY.length), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-lg border border-zinc-200/80 dark:border-white/[0.08] px-4 py-3.5 bg-white/60 dark:bg-white/[0.03] flex items-center gap-3"
    >
      {/* 律动条 */}
      <div className="flex items-end gap-[2.5px] h-5 shrink-0" aria-hidden="true">
        {VISION_BAR_DELAYS.map((delay, i) => (
          <span
            key={i}
            className="w-[3.5px] rounded-sm bg-zinc-300 dark:bg-zinc-600"
            style={{
              height: "100%",
              transformOrigin: "bottom",
              animation: `visionBar 0.6s ${delay} ease-in-out infinite alternate`,
            }}
          />
        ))}
        <style>{`
          @keyframes visionBar {
            0%   { transform: scaleY(0.2); }
            100% { transform: scaleY(1); }
          }
        `}</style>
      </div>
      {/* 轮换文案 */}
      <div className="relative h-5 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={idx}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 text-sm leading-5 text-zinc-500 dark:text-zinc-400"
          >
            {VISION_COPY[idx]}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

const uploadSkeleton = (
  <div className="h-64 w-full rounded-xl border border-zinc-100 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.04] animate-pulse" />
);

const DragUpload = dynamic(
  () => import("@/components/upload/drag-upload").then((m) => ({ default: m.DragUpload })),
  { ssr: false, loading: () => uploadSkeleton }
);

const GuessRefine = dynamic(
  () => import("@/components/guess/guess-refine").then((m) => ({ default: m.GuessRefine })),
  { ssr: false, loading: () => (
    <div className="flex flex-col items-center gap-2.5 py-8">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-600 animate-pulse" />
        ))}
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">正在加载风格建议…</p>
    </div>
  ) }
);

const HeroCompare = dynamic(
  () => import("@/components/home/hero-compare").then((m) => ({ default: m.HeroCompare })),
  { ssr: false, loading: () => (
    <div className="mt-4 h-56 w-full rounded-xl border border-zinc-100 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.04] animate-pulse" />
  ) }
);

const WORKSPACE_ALLOWED_TYPES = ["image/jpeg", "image/png"];
const WORKSPACE_ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const WORKSPACE_ACCEPT = [...WORKSPACE_ALLOWED_EXTENSIONS, ...WORKSPACE_ALLOWED_TYPES].join(",");
const WORKSPACE_MAX_BYTES = 5 * 1024 * 1024;

function validateWorkspaceImageFile(file: File): string | null {
  if (!WORKSPACE_ALLOWED_TYPES.includes(file.type)) {
    return `仅支持 JPG / PNG 格式（当前：${file.type || "未知"}）`;
  }
  if (file.size > WORKSPACE_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `文件大小 ${mb} MB，超出 5 MB 限制`;
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(!!mql.matches);
    apply();
    mql.addEventListener?.("change", apply);
    return () => mql.removeEventListener?.("change", apply);
  }, []);
  return reduced;
}

function useTypewriterOnce(text: string, speedMs = 28): string {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const playedRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed(text);
      completedRef.current = true;
      return;
    }
    if (playedRef.current) return;
    playedRef.current = true;
    completedRef.current = false;

    indexRef.current = 0;
    setDisplayed("");
    const chars = [...text];
    let lastTime = 0;
    const tick = (now: number) => {
      if (now - lastTime >= speedMs) {
        lastTime = now;
        if (indexRef.current < chars.length) {
          indexRef.current += 1;
          setDisplayed(chars.slice(0, indexRef.current).join(""));
        }
      }
      if (indexRef.current < chars.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        completedRef.current = true;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (!completedRef.current) playedRef.current = false;
    };
  }, [prefersReducedMotion, speedMs, text]);

  return displayed;
}

export default function CreatePage() {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const [analysisResult, setAnalysisResult] = useState<VisionAnalysis | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const completedActionsRef = useRef<HTMLDivElement | null>(null);
  const [job, setJob] = useState<{
    mode: "image" | "video";
    style: string;
    jobId: string;
    status: "idle" | "submitting" | "polling" | "completed" | "failed";
    resultUrl?: string;
    error?: string;
  } | null>(null);
  const [toast, setToast] = useState<null | { title: string; description?: string; tone?: "success" | "error" | "info"; durationMs?: number }>(null);
  const [publishing, setPublishing] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const authed = authStatus === "loading" ? null : authStatus === "authed";
  const lastGenerateRef = useRef<{ option: GuessOption; mode: "image" | "video" } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rePickInputRef = useRef<HTMLInputElement | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const dramaWordCls = useMemo(() => [
    "bg-gradient-to-r from-blue-600 via-violet-500 to-fuchsia-500",
    "text-transparent bg-clip-text",
    "drop-shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:drop-shadow-[0_1px_0_rgba(0,0,0,0.32)]",
  ].join(" "), []);
  const titleTokens = useMemo(() => ([
    { text: "把", cls: "font-normal" },
    { text: "日常碎片", cls: "font-semibold" },
    { text: "，", cls: "font-normal" },
    { text: "发给 AI", cls: "font-semibold" },
    { text: "，", cls: "font-normal" },
    { text: "变成一张", cls: "font-normal" },
    { text: "Drama", cls: dramaWordCls },
    { text: "的梗图", cls: "font-normal" },
  ]), [dramaWordCls]);
  const fullTitle = titleTokens.map((t) => t.text).join("");
  const typedTitle = useTypewriterOnce(fullTitle, 50);
  const showCaret = typedTitle.length < fullTitle.length;
  const typedByToken = useMemo(() => {
    let offset = 0;
    return titleTokens.map((t) => {
      const visible = typedTitle.slice(offset, offset + t.text.length);
      offset += t.text.length;
      return visible;
    });
  }, [titleTokens, typedTitle]);
  const workspaceMode = !!uploadedPreviewUrl;
  const completedResultUrl = job?.status === "completed" && job.resultUrl ? job.resultUrl : null;
  const resultPending = job?.status === "submitting" || job?.status === "polling";
  const clearToast = useCallback(() => setToast(null), []);

  const showToast = useCallback(
    (title: string, opts?: { description?: string; tone?: "success" | "error" | "info"; durationMs?: number }) =>
      setToast({ title, ...opts }),
    []
  );

  // 生成完成时：弹出提示 + 滚动到操作区
  useEffect(() => {
    if (job?.status !== "completed" || !job.resultUrl) return;
    showToast("Drama 图已生成！", {
      description: "点击「发布到广场」让 NPC 来捧场。",
      tone: "success",
      durationMs: 5000,
    });
    try {
      completedActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch { /* noop */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.resultUrl]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制链接", { tone: "success" });
    } catch {
      showToast("复制失败", { description: "请手动复制", tone: "error", durationMs: 3800 });
    }
  }, [showToast]);

  const downloadFromUrl = useCallback(async (url: string, filename: string) => {
    try {
      // 通过服务端代理下载，绕开跨域限制
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      showToast("开始下载", { tone: "info" });
    } catch {
      // 降级：新标签页打开
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast("已在新窗口打开", {
          description: "右键图片选择「另存为」即可保存",
          tone: "info",
          durationMs: 4000,
        });
      } catch {
        showToast("下载失败", { description: "可复制链接后手动保存", tone: "error", durationMs: 3800 });
      }
    }
  }, [showToast]);

  const handlePublicUrlReady = useCallback((url: string) => {
    setPublicUrl(url);
  }, []);

  const handleUploadSuccess = useCallback((base64: string) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setUploadedPreviewUrl(base64);
    setAnalysisResult(null);
    setJob(null);
    setPublicUrl(null);
  }, []);

  const resetWorkspace = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setUploadedPreviewUrl(null);
    setAnalysisResult(null);
    setJob(null);
    setPublicUrl(null);
  }, []);

  const handleAnalysisComplete = useCallback((analysis: VisionAnalysis) => {
    setAnalysisResult(analysis);
    setJob(null);
  }, []);

  const handleRePickFile = useCallback(async (file: File) => {
    const validationError = validateWorkspaceImageFile(file);
    if (validationError) {
      showToast("无法选择这张图片", { description: validationError, tone: "error", durationMs: 3800 });
      return;
    }

    try {
      const base64 = await readFileAsDataUrl(file);
      handleUploadSuccess(base64);

      const uploadTask = (async () => {
        try {
          const uploadRes = await fetch("/api/storage/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64 }),
          });
          const uploadData = await uploadRes.json() as {
            success: boolean;
            publicUrl?: string;
            error?: string;
          };
          if (uploadData.success && uploadData.publicUrl) {
            handlePublicUrlReady(uploadData.publicUrl);
          } else if (!uploadData.success) {
            console.warn("[CreatePage] Supabase 上传失败：", uploadData.error);
          }
        } catch (e) {
          console.warn("[CreatePage] Supabase 上传异常：", e);
        }
      })();

      const visionTask = (async () => {
        const apiResponse = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        return (await apiResponse.json()) as VisionResponse;
      })();

      const [visionResult] = await Promise.all([visionTask, uploadTask]);
      if (!visionResult.success) {
        showToast("分析失败", { description: visionResult.error, tone: "error", durationMs: 3800 });
        return;
      }

      handleAnalysisComplete(visionResult.data);
    } catch (e) {
      console.error("[CreatePage] 重新选择处理异常：", e);
      showToast("重新选择失败", { description: "请稍后重试", tone: "error", durationMs: 3800 });
    }
  }, [handleAnalysisComplete, handlePublicUrlReady, handleUploadSuccess, showToast]);

  const handleRePickInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (file) void handleRePickFile(file);
  }, [handleRePickFile]);

  const pollJob = useCallback(async (mode: "image" | "video", jobId: string) => {
    const path = mode === "image" ? "/api/image/query" : "/api/video/query";
    const model = mode === "image" ? "hy-image-v3.0" : "hy-video-1.5";

    const poll = async () => {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: jobId, model }),
        });
        const data = await res.json() as {
          success: boolean;
          data?: { status?: string; data?: Array<{ url?: string }>; [k: string]: unknown };
          error?: string;
        };

        if (!data.success) {
          setJob((j) => j ? { ...j, status: "failed", error: data.error ?? "查询失败" } : j);
          return;
        }

        const upstreamStatus = String(data.data?.status ?? "").toLowerCase();
        const rawData = data.data?.data as Array<{ url?: string }> | { url?: string } | undefined;
        const resultUrl = Array.isArray(rawData)
          ? rawData[0]?.url
          : (rawData as { url?: string } | undefined)?.url;

        if (upstreamStatus === "completed" && resultUrl) {
          setJob((j) => j ? { ...j, status: "completed", resultUrl } : j);
          return;
        }
        if (["failed", "error", "canceled"].includes(upstreamStatus)) {
          setJob((j) => j ? { ...j, status: "failed", error: `任务状态：${upstreamStatus}` } : j);
          return;
        }

        setJob((j) => j ? { ...j, status: "polling" } : j);
        pollTimerRef.current = setTimeout(poll, 3000);
      } catch (e) {
        setJob((j) => j ? { ...j, status: "failed", error: String(e) } : j);
      }
    };

    poll();
  }, []);

  const handleGenerate = useCallback(
    async (option: GuessOption, mode: "image" | "video") => {
      if (!analysisResult) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      lastGenerateRef.current = { option, mode };

      const prompt = [
        `${analysisResult.mainEntity}，情绪：${analysisResult.userEmotion}。`,
        option.prompt,
      ].join(" ");

      const submitPath = mode === "image" ? "/api/image/submit" : "/api/video/submit";
      const submitModel = mode === "image" ? "hy-image-v3.0" : "hy-video-1.5";

      setJob({ mode, style: option.title, jobId: "", status: "submitting" });

      try {
        const body: Record<string, unknown> = { prompt, model: submitModel };
        if (publicUrl) body.images = [publicUrl];

        const res = await fetch(submitPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json() as {
          success: boolean;
          data?: { id?: string; [k: string]: unknown };
          error?: string;
        };

        if (!data.success || !data.data?.id) {
          setJob((j) => j ? { ...j, status: "failed", error: data.error ?? "提交失败" } : j);
          return;
        }

        const newJobId = String(data.data.id);
        setJob((j) => j ? { ...j, jobId: newJobId, status: "polling" } : j);
        pollJob(mode, newJobId);
      } catch (e) {
        setJob((j) => j ? { ...j, status: "failed", error: String(e) } : j);
      }
    },
    [analysisResult, publicUrl, pollJob]
  );

  const retryLastGenerate = useCallback(() => {
    const last = lastGenerateRef.current;
    if (!last) return;
    handleGenerate(last.option, last.mode);
  }, [handleGenerate]);

  const handlePublish = useCallback(async () => {
    if (!job?.resultUrl) return;
    if (publishing) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/posts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultUrl: job.resultUrl,
          mode: job.mode,
          style: job.style,
          analysis: analysisResult,
        }),
      });
      const data = await res.json() as { success: boolean; id?: string; error?: string };
      if (!data.success || !data.id) {
        showToast(data.error ?? "发布失败");
        return;
      }
      try {
        const key = `xtdDrama.stagedAt.${data.id}`;
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, String(Date.now()));
        }
      } catch {
        // ignore
      }
      // fire-and-forget：确保发布后 likes/comments 的源数据尽快稳定（幂等）
      fetch("/api/likes/npc-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: data.id }),
      }).catch(() => void 0);
      fetch("/api/comments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: data.id }),
      }).catch(() => void 0);
      showToast("已发布", { description: "已同步到广场", tone: "success" });
      router.push("/plaza");
    } catch (e) {
      showToast(String(e));
    } finally {
      setPublishing(false);
    }
  }, [analysisResult, job, publishing, router, showToast]);

  const canPublish = !!job?.resultUrl && job?.status === "completed" && !publishing;
  const analysisLine = useMemo(() => {
    if (!analysisResult) return "";
    return `${analysisResult.mainEntity} · ${analysisResult.sceneState} · ${analysisResult.userEmotion}`;
  }, [analysisResult]);

  const requestCreateLogin = useCallback(() => {
    requestLogin("登录以使用全部功能~");
  }, []);

  return (
    <div className="apple-container py-10">
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="查看大图"
          onClose={() => setLightboxSrc(null)}
        />
      )}

      <div className="mx-auto w-full max-w-6xl">
        <AnimatePresence mode="wait" initial={false}>
        {!workspaceMode ? (
        <motion.div
          key="intro"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-8"
        >
          {/* 段1：标题区（居中） */}
          <div className="pt-2 text-center w-full">
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] tracking-tight leading-[1.1] text-zinc-900 dark:text-zinc-50">
              {/* lg+：强制单行展示（不换行） */}
              <span className="hidden lg:inline whitespace-nowrap">
                {titleTokens.map((t, i) => (
                  <span key={`${t.text}-${i}`} className={t.cls}>
                    {typedByToken[i]}
                  </span>
                ))}
                <span
                  aria-hidden="true"
                  className={[
                    "inline-block w-[1.5px] h-[0.9em] bg-zinc-400 dark:bg-zinc-500 ml-0.5 align-middle",
                    showCaret ? "animate-pulse opacity-100" : "opacity-0",
                  ].join(" ")}
                />
              </span>
              {/* <lg：维持三行（标题两行 + 副标题） */}
              <span className="lg:hidden">
                <span className="block">
                  {titleTokens.slice(0, 4).map((t, i) => (
                    <span key={`${t.text}-${i}`} className={t.cls}>
                      {typedByToken[i]}
                    </span>
                  ))}
                </span>
                <span className="block">
                  {titleTokens.slice(5).map((t, idx) => {
                    const i = idx + 5;
                    return (
                      <span key={`${t.text}-${i}`} className={t.cls}>
                        {typedByToken[i]}
                      </span>
                    );
                  })}
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    "inline-block w-[1.5px] h-[0.9em] bg-zinc-400 dark:bg-zinc-500 ml-0.5 align-middle",
                    showCaret ? "animate-pulse opacity-100" : "opacity-0",
                  ].join(" ")}
                />
              </span>
            </h1>
            <p className="mt-3 text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
              别多想，上传一张图片就开始。
            </p>
          </div>

          {/* 段2+3：三块布局（左：示例；右上：引导；右下：上传） */}
          <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] lg:gap-x-10 gap-y-6 items-start">

            {/* 左：示例图（桌面端跨两行；移动端排最后） */}
            <div className="order-3 lg:order-none lg:row-span-2 min-w-0 border-t border-zinc-100 dark:border-white/[0.06] pt-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                原图 vs 重构（示例）
              </h2>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                不是滤镜，是把“同一个瞬间”改写成更夸张的视觉表达。
              </p>
              <div className="mt-4">
                <HeroCompare
                  inputSrc="/compare/a0.png"
                  outputSrc="/compare/a1.png"
                  inputLabel="原图"
                  outputLabel="对比图"
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-zinc-500 dark:text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9A2 2 0 0 0 19.68 9H14Z" />
                    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  <span className="tabular-nums">5</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { src: (ProfilePic1 as unknown as { src: string }).src ?? String(ProfilePic1), alt: "Emma" },
                      { src: (ProfilePic2 as unknown as { src: string }).src ?? String(ProfilePic2), alt: "Liam" },
                      { src: (ProfilePic3 as unknown as { src: string }).src ?? String(ProfilePic3), alt: "Olivia" },
                      { src: (ProfilePic4 as unknown as { src: string }).src ?? String(ProfilePic4), alt: "Noah" },
                      { src: (ProfilePic5 as unknown as { src: string }).src ?? String(ProfilePic5), alt: "Sophia" },
                    ] as Array<{ src: string; alt: string }>
                  ).map((x, i) => (
                    <span key={i} className="h-6 w-6 rounded-lg overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={x.src} alt={x.alt} loading="lazy" decoding="async"
                        className="h-full w-full object-cover rounded-lg border border-zinc-200/40 dark:border-white/[0.08]"
                      />
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 border-t border-zinc-100 dark:border-white/[0.06] pt-4">
                {(
                  [
                    { name: "Emma", time: "刚刚", msg: "“这张也太有戏了…我先笑为敬。”", src: (ProfilePic1 as unknown as { src: string }).src ?? String(ProfilePic1) },
                    { name: "Liam", time: "1 分钟前", msg: "“我宣布这就是今天的最佳梗图。”", src: (ProfilePic2 as unknown as { src: string }).src ?? String(ProfilePic2) },
                    { name: "Olivia", time: "2 分钟前", msg: "“别停，发到广场，我给你顶上去。”", src: (ProfilePic3 as unknown as { src: string }).src ?? String(ProfilePic3) },
                    { name: "Noah", time: "6 分钟前", msg: "“太真实了，隔着屏幕都能闻到焦虑味。”", src: (ProfilePic4 as unknown as { src: string }).src ?? String(ProfilePic4) },
                    { name: "Sophia", time: "9 分钟前", msg: "“氛围感拉满，但又不油，刚刚好。”", src: (ProfilePic5 as unknown as { src: string }).src ?? String(ProfilePic5) },
                  ] as Array<{ name: string; time: string; msg: string; src: string }>
                ).map((x, idx) => (
                  <div key={x.name} className={[
                    "flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors",
                    "hover:bg-zinc-50 dark:hover:bg-white/[0.04]",
                    idx === 0 ? "" : "border-t border-zinc-100/70 dark:border-white/[0.06]",
                  ].join(" ")}>
                    <div className="mt-0.5 h-6 w-6 rounded-lg overflow-hidden" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={x.src} alt="" loading="lazy" decoding="async"
                        className="h-full w-full object-cover rounded-lg border border-zinc-200/40 dark:border-white/[0.08]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{x.name}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-500 shrink-0">{x.time}</div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{x.msg}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 右上：引导四步（移动端排第一） */}
            <div className="order-1 lg:order-none min-w-0 border-t border-zinc-100 dark:border-white/[0.06] pt-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                四步就够，但每步都有意义
              </h2>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                发图 → 选风格 → 生成 → 发布。你不用写提示词，我们负责把“小事”做成“戏”。
              </p>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                约 20–40 秒完成 · 失败会保留原图，可重试
              </div>
              <div className="mt-4 flex flex-col">
                {[
                  { k: "01", t: "发图", d: "随手一张日常：DDL、倒霉瞬间、无聊到发光都行。" },
                  { k: "02", t: "选风格", d: "AI 给你 3 个方向，点一下就收敛意图。" },
                  { k: "03", t: "生成", d: "结构尽量贴原图，只把材质与氛围戏剧化。" },
                  { k: "04", t: "发布", d: "发到广场后，NPC 5 秒内捧场评论，不让你空等。" },
                ].map((x, idx) => (
                  <div key={x.k} className={["py-3", idx === 0 ? "" : "border-t border-zinc-100 dark:border-white/[0.06]"].join(" ")}>
                    <div className="flex items-start gap-3">
                      <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 mt-0.5">{x.k}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{x.t}</div>
                        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{x.d}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 右下：上传入口（移动端排第二） */}
            <div className="order-2 lg:order-none w-full border-t border-zinc-100 dark:border-white/[0.06] pt-6">
                <DragUpload
                  onUploadSuccess={handleUploadSuccess}
                  onPublicUrlReady={handlePublicUrlReady}
                  onAnalysisComplete={handleAnalysisComplete}
                  isGuest={authed === false}
                  onGuestAttempt={requestCreateLogin}
                />
            </div>

          </div>


        <div className="mt-10">
          <div className="border-t border-zinc-100 dark:border-white/[0.06] pt-8">
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
              Under the hood
            </span>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              三层 AI，悄悄运作
            </h2>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { tag: "YT-VITA", title: "看懂你的图", desc: "多模态理解图片语义，输出场景与情绪标签。" },
                { tag: "HY-Image / Video", title: "重绘，Drama 化", desc: "在结构约束下做夸张重构，生成更“戏”的画面。" },
                { tag: "NPC Engine", title: "评论秒到位", desc: "多角色人设评论，消灭发布后的社交空窗期。" },
              ].map((x, i) => (
                <div
                  key={x.tag}
                  className={[
                    "pt-4",
                    i === 0 ? "" : "sm:pt-4 sm:border-l sm:border-zinc-100 sm:dark:border-white/[0.06] sm:pl-5",
                  ].join(" ")}
                >
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
                    {x.tag}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {x.title}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {x.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)] gap-8 items-start min-h-[calc(100vh-9rem)]"
          >
            <section className="min-w-0 border-t border-zinc-100 dark:border-white/[0.06] pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
                    Workspace
                  </div>
                  <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    你的 Drama 正在生成
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetWorkspace}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    onClick={() => rePickInputRef.current?.click()}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    重新选择
                  </button>
                  <input
                    ref={rePickInputRef}
                    type="file"
                    accept={WORKSPACE_ACCEPT}
                    className="sr-only"
                    onChange={handleRePickInputChange}
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <div className="relative rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.02] overflow-hidden">
                  <div className="absolute left-3 top-3 z-10 rounded-md border border-zinc-200/70 dark:border-white/[0.08] bg-white/85 dark:bg-[oklch(0.16_0.004_265)]/85 px-2 py-1 text-[11px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
                    原图
                  </div>
                  {/* 扫描线：仅在 Vision 分析进行时（有图但还没分析结果）显示 */}
                  {uploadedPreviewUrl && !analysisResult && !job && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl"
                    >
                      <div
                        className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-400/70 dark:via-blue-500/60 to-transparent"
                        style={{ animation: "visionScan 2s linear infinite" }}
                      />
                      <style>{`
                        @keyframes visionScan {
                          0%   { top: 0%; }
                          100% { top: 100%; }
                        }
                      `}</style>
                    </div>
                  )}
                  <div className="h-[min(32vh,300px)] min-h-[220px] flex items-center justify-center p-3">
                    {uploadedPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={uploadedPreviewUrl}
                        alt="上传的原图"
                        className="h-full w-full object-contain cursor-zoom-in"
                        onClick={() => setLightboxSrc(uploadedPreviewUrl)}
                      />
                    ) : null}
                  </div>
                </div>

                <div className="relative rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.02] overflow-hidden">
                  <div className="absolute left-3 top-3 z-10 rounded-md border border-zinc-200/70 dark:border-white/[0.08] bg-white/85 dark:bg-[oklch(0.16_0.004_265)]/85 px-2 py-1 text-[11px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
                    {resultPending ? "生成中…" : "生成图"}
                  </div>
                  <div className="h-[min(32vh,300px)] min-h-[220px] flex items-center justify-center p-3">
                    {completedResultUrl ? (
                      job?.mode === "video" ? (
                        <video
                          src={completedResultUrl}
                          controls
                          playsInline
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={completedResultUrl}
                          alt="AI 生成图"
                          className="h-full w-full object-contain cursor-zoom-in"
                          onClick={() => setLightboxSrc(completedResultUrl)}
                        />
                      )
                    ) : resultPending ? (
                      <div className="flex h-full w-full flex-col items-center justify-center px-4">
                        <DramaGeneratingLoader status={job!.status as "submitting" | "polling"} />
                      </div>
                    ) : job?.status === "failed" ? (
                      <div className="text-sm text-zinc-500 dark:text-zinc-500">
                        生成失败，可在右侧重试。
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500 dark:text-zinc-500">
                        选择风格后，生成结果会显示在这里。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="min-w-0 border-t border-zinc-100 dark:border-white/[0.06] pt-5 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
              <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
                Flow
              </div>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                继续完成这张图
              </h2>

              <div className="mt-5 flex flex-col gap-4">
                {analysisResult ? (
                  /* Vision 结果：三字段 stagger 揭示 */
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
                  >
                    <motion.div
                      variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22,1,0.36,1] } } }}
                      className="text-[10px] font-medium text-zinc-500 dark:text-zinc-600 uppercase tracking-widest"
                    >
                      AI 感知完毕 · YT-VITA
                    </motion.div>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {([
                        { label: "主体", value: analysisResult.mainEntity },
                        { label: "场景", value: analysisResult.sceneState },
                        { label: "情绪", value: analysisResult.userEmotion },
                      ] as { label: string; value: string | null | undefined }[])
                        .filter((f) => !!f.value)
                        .map((f) => (
                          <motion.div
                            key={f.label}
                            variants={{ hidden: { opacity: 0, x: -4 }, visible: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22,1,0.36,1] } } }}
                            className="flex items-baseline gap-1.5 text-sm leading-relaxed"
                          >
                            <span className="shrink-0 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 tabular-nums">
                              {f.label}：
                            </span>
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {f.value}
                            </span>
                          </motion.div>
                        ))}
                    </div>
                  </motion.div>
                ) : (
                  /* Vision 等待中：律动条 + 轮换文案 */
                  <VisionScanLoader />
                )}

                {analysisResult && (
                  <GuessRefine analysis={analysisResult} onGenerate={handleGenerate} />
                )}

                {job && (
                  <div className="border-t border-zinc-100 dark:border-white/[0.06] pt-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
                        {job.mode === "image" ? "HY-Image-V3.0" : "HY-Video-1.5"}
                      </span>
                      <span className={[
                        "text-[11px] px-2 py-0.5 rounded-full font-medium border",
                        job.status === "completed"
                          ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50"
                          : job.status === "failed"
                            ? "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50"
                            : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-white/[0.04] dark:text-zinc-500 dark:border-white/[0.08]",
                      ].join(" ")}>
                        {job.status === "submitting" ? "提交中"
                          : job.status === "polling" ? "生成中"
                          : job.status === "completed" ? "已完成" : "失败"}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-500 dark:text-zinc-500">风格：{job.style}</p>
                    {job.jobId && (
                      <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-600">
                        任务 ID：{job.jobId}
                      </p>
                    )}

                    {job.status === "completed" && job.resultUrl && (
                      <div ref={completedActionsRef} className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(job.resultUrl!)}
                          className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                        >
                          复制链接
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadFromUrl(
                            job.resultUrl!,
                            `drama-${job.mode}-${Date.now()}${job.mode === "image" ? ".png" : ".mp4"}`
                          )}
                          className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                        >
                          下载
                        </button>
                        <button
                          type="button"
                          onClick={handlePublish}
                          disabled={!canPublish}
                          className={[
                            "h-8 px-3 rounded-lg text-xs font-medium text-white apple-btn-primary",
                            "disabled:opacity-60 disabled:cursor-not-allowed",
                          ].join(" ")}
                        >
                          {publishing ? "发布中…" : "发布到广场"}
                        </button>
                      </div>
                    )}

                    {job.status === "failed" && (
                      <InlineAlert
                        tone="danger"
                        title="生成失败"
                        description={job.error ?? "请稍后重试"}
                        action={
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={retryLastGenerate}
                              className="h-8 px-3 rounded-lg text-xs font-medium text-white apple-btn-primary"
                            >
                              重试生成
                            </button>
                            {job.jobId ? (
                              <button
                                type="button"
                                onClick={() => pollJob(job.mode, job.jobId)}
                                className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                              >
                                重新查询
                              </button>
                            ) : null}
                          </div>
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      <div className="mt-8 border-t border-zinc-100 dark:border-white/[0.06] pt-4">
        <div className="text-sm text-zinc-500 dark:text-zinc-500 font-light italic text-center">
          “生活的 99% 是平庸，剩下的 1% 是 Drama。”
        </div>
      </div>
    </div>
  );
}

