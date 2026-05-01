"use client";

/**
 * pipeline-observability.ts — 完整主链路埋点
 *
 * 覆盖从"用户选图"到"发布成功"的 8 个关键节点，
 * 通过 sendBeacon 上报 /api/metrics/pipeline，
 * 同时写入 sessionStorage 供评审演示面板读取。
 *
 * 事件列表：
 *   pipeline_source_selected   - 用户选图完成（本地图片）
 *   pipeline_upload_done        - 原图上传到 Supabase 完成（拿到 publicUrl）
 *   pipeline_vision_ready       - Vision 感知结果返回
 *   pipeline_guess_ready        - Guess 选项返回
 *   pipeline_generate_submit    - 提交生图任务
 *   pipeline_generate_completed - 生图成功，resultUrl 就绪
 *   pipeline_generate_failed    - 生图失败
 *   pipeline_publish_success    - 发布到广场成功
 *   pipeline_publish_failed     - 发布失败
 */

import { imageMetricsEnabled } from "@/lib/image-flags";

export type PipelineEvent =
  | "pipeline_source_selected"
  | "pipeline_upload_done"
  | "pipeline_vision_ready"
  | "pipeline_guess_ready"
  | "pipeline_generate_submit"
  | "pipeline_generate_completed"
  | "pipeline_generate_failed"
  | "pipeline_publish_success"
  | "pipeline_publish_failed";

export type PipelineMetricPayload = {
  event: PipelineEvent;
  /** 输入类型：image / video（创作页仅本地图） */
  sourceType?: "image" | "video";
  /** 生图模式 */
  mode?: "image" | "video";
  /** 是否携带参考图 */
  hasReference?: boolean;
  /** 本次操作耗时（ms） */
  durationMs?: number;
  /** 失败原因 */
  reason?: string;
  at: number;
  sessionId: string;
};

const BUFFER_KEY = "xtdDrama.pipelineMetrics.buffer";
const SESSION_ID_KEY = "xtdDrama.pipelineMetrics.sessionId";
const MAX_BUFFER = 120;

function getSessionId(): string {
  try {
    const stored = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (stored) return stored;
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

function writeLocalBuffer(event: PipelineMetricPayload) {
  try {
    const raw = window.sessionStorage.getItem(BUFFER_KEY);
    const prev = raw ? (JSON.parse(raw) as PipelineMetricPayload[]) : [];
    const next = [...prev.slice(-(MAX_BUFFER - 1)), event];
    window.sessionStorage.setItem(BUFFER_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function sendToServer(event: PipelineMetricPayload) {
  try {
    const body = JSON.stringify(event);
    if ("sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/metrics/pipeline", blob);
      return;
    }
    void fetch("/api/metrics/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

export function emitPipelineMetric(
  event: PipelineEvent,
  payload?: Omit<PipelineMetricPayload, "event" | "at" | "sessionId">
) {
  if (!imageMetricsEnabled()) return;
  if (typeof window === "undefined") return;
  const record: PipelineMetricPayload = {
    event,
    at: Date.now(),
    sessionId: getSessionId(),
    ...payload,
  };
  writeLocalBuffer(record);
  sendToServer(record);
}

/**
 * 读取本 session 的 pipeline 事件缓冲（供评审面板展示）。
 * 仅在客户端可用。
 */
export function readPipelineBuffer(): PipelineMetricPayload[] {
  try {
    const raw = window.sessionStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as PipelineMetricPayload[]) : [];
  } catch {
    return [];
  }
}

/**
 * 从 buffer 中计算简要统计（供评审面板使用）。
 */
export function computePipelineStats(buffer: PipelineMetricPayload[]) {
  const sessions = new Set(buffer.map((x) => x.sessionId));
  const generateAttempts = buffer.filter((x) =>
    x.event === "pipeline_generate_submit"
  );
  const generateSuccess = buffer.filter(
    (x) => x.event === "pipeline_generate_completed"
  );
  const generateFailed = buffer.filter(
    (x) => x.event === "pipeline_generate_failed"
  );
  const publishSuccess = buffer.filter(
    (x) => x.event === "pipeline_publish_success"
  );

  const durations = generateSuccess
    .map((x) => x.durationMs)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const medianDuration =
    durations.length > 0
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
      : null;

  return {
    sessions: sessions.size,
    generateAttempts: generateAttempts.length,
    generateSuccess: generateSuccess.length,
    generateFailed: generateFailed.length,
    publishSuccess: publishSuccess.length,
    successRate:
      generateAttempts.length > 0
        ? Math.round((generateSuccess.length / generateAttempts.length) * 100)
        : null,
    medianGenerateDurationMs: medianDuration,
  };
}
