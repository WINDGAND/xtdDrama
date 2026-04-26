"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DragUpload } from "@/components/upload/drag-upload";
import { GuessRefine } from "@/components/guess/guess-refine";
import { Toast } from "@/components/ui/toast";
import { InlineAlert } from "@/components/ui/inline-alert";
import { HeroCompare } from "@/components/home/hero-compare";
import { Reveal } from "@/components/motion/reveal";
import type { VisionAnalysis } from "@/types/vision";
import type { GuessOption } from "@/types/guess";

export default function CreatePage() {
  const router = useRouter();
  const [analysisResult, setAnalysisResult] = useState<VisionAnalysis | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [job, setJob] = useState<{
    mode: "image" | "video";
    style: string;
    jobId: string;
    status: "idle" | "submitting" | "polling" | "completed" | "failed";
    resultUrl?: string;
    error?: string;
  } | null>(null);
  const [toast, setToast] = useState<string>("");
  const [publishing, setPublishing] = useState(false);
  const lastGenerateRef = useRef<{ option: GuessOption; mode: "image" | "video" } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制链接");
    } catch {
      showToast("复制失败，请手动复制");
    }
  }, [showToast]);

  const downloadFromUrl = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      showToast("开始下载");
    } catch {
      showToast("下载失败，可用“打开链接”保存");
    }
  }, [showToast]);

  const handlePublicUrlReady = useCallback((url: string) => {
    setPublicUrl(url);
  }, []);

  const handleAnalysisComplete = useCallback((analysis: VisionAnalysis) => {
    setAnalysisResult(analysis);
    setJob(null);
  }, []);

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
      showToast("已发布");
      router.push(`/posts/${data.id}`);
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

  return (
    <div className="apple-container py-10">
      <Toast message={toast} onClear={() => setToast("")} />

      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-y-6 gap-x-10 items-start">
          <div className="pt-2">
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold tracking-tight leading-[1.1] text-zinc-900 dark:text-zinc-50">
              把平庸的日常{" "}
              <span className="text-zinc-500 dark:text-zinc-400 font-light">发给 AI 看看</span>
            </h1>
            <p className="mt-3 text-base text-zinc-700 dark:text-zinc-300 leading-relaxed max-w-[30rem]">
              上传一张你今天最无聊的照片。就这样，别多想。
            </p>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 font-light italic leading-relaxed">
              “生活的 99% 是平庸，剩下的 1% 是 Drama。”
            </p>
            <div className="mt-6 hidden lg:block border-t border-zinc-100 dark:border-white/[0.06] pt-4">
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">四步就够</div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                看懂 → 给方向 → 生成 → 发布。过程不需要你写提示词。
              </div>
              <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
                发布后会有 NPC 5 秒内捧场评论，消灭社交空窗期。
              </div>
            </div>
          </div>

          <div className="w-full flex flex-col gap-3">
            <DragUpload onPublicUrlReady={handlePublicUrlReady} onAnalysisComplete={handleAnalysisComplete} />

            {analysisResult && (
              <div className="border-t border-zinc-100 dark:border-white/[0.06] pt-3">
                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-600 uppercase tracking-widest">
                  AI 感知完毕 · YT-VITA
                </div>
                <div className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {analysisLine}
                </div>
              </div>
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
                  <div className="flex flex-col gap-2">
                    {job.mode === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={job.resultUrl}
                        alt="AI 生成图"
                        className="w-full rounded-xl object-cover border border-zinc-200/30 dark:border-white/[0.08]"
                        style={{ maxHeight: 420 }}
                      />
                    ) : (
                      <video
                        src={job.resultUrl}
                        controls
                        playsInline
                        className="w-full rounded-xl border border-zinc-200/30 dark:border-white/[0.08]"
                        style={{ maxHeight: 420 }}
                      />
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
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
                      <Link
                        href="/plaza"
                        className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors flex items-center"
                      >
                        去广场看看
                      </Link>
                    </div>
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
        </div>

        {/* 二级内容区：保留“叙述式”但不打断主流程 */}
        <div className="mt-10 border-t border-zinc-100 dark:border-white/[0.06] pt-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 items-start">
            <Reveal className="min-w-0" variant="story" amount={0.35} delay={0.02}>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                四步就够，但每步都有意义
              </h2>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                发图 → 选风格 → 生成 → 发布。你不用写提示词，我们负责把“小事”做成“戏”。
              </p>

              <div className="mt-5 flex flex-col">
                {[
                  { k: "01", t: "发图", d: "随手一张日常：DDL、倒霉瞬间、无聊到发光都行。" },
                  { k: "02", t: "选风格", d: "AI 给你 3 个方向，点一下就收敛意图。" },
                  { k: "03", t: "生成", d: "结构尽量贴原图，只把材质与氛围戏剧化。" },
                  { k: "04", t: "发布", d: "发到广场后，NPC 5 秒内捧场评论，不让你空等。" },
                ].map((x, idx) => (
                  <div
                    key={x.k}
                    className={[
                      "py-4",
                      idx === 0 ? "" : "border-t border-zinc-100 dark:border-white/[0.06]",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 mt-0.5">
                        {x.k}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                          {x.t}
                        </div>
                        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {x.d}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal className="min-w-0" variant="story" amount={0.35} delay={0.06}>
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
            </Reveal>
          </div>

          <Reveal className="mt-10" variant="story" amount={0.3} delay={0.02}>
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
          </Reveal>
        </div>
      </div>
    </div>
  );
}

