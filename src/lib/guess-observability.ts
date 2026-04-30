"use client";

/**
 * guess-observability.ts — Guess & Refine 行为埋点
 *
 * 事件列表：
 *   - guess_batch_refresh_click    : 点击"换一批"
 *   - guess_batch_refresh_success  : 换批成功（含批次号和去重级别）
 *   - guess_custom_hint_open       : 展开"我自己说一句"输入框
 *   - guess_custom_hint_submit     : 提交影响推荐（基于此重新推荐）
 *   - guess_custom_direct_generate : 提交直接生成
 *   - guess_option_selected        : 选中某个风格选项
 *
 * 通过 sessionStorage 本地缓存（供调试），同时用 sendBeacon 上报 /api/metrics/guess。
 */

import { imageMetricsEnabled } from "@/lib/image-flags";

type GuessEvent =
  | "guess_batch_refresh_click"
  | "guess_batch_refresh_success"
  | "guess_custom_hint_open"
  | "guess_custom_hint_submit"
  | "guess_custom_direct_generate"
  | "guess_option_selected";

type GuessMetricEvent = {
  event: GuessEvent;
  batchIndex?: number;
  optionTitle?: string;
  dedupLevel?: string;
  hasUserHint?: boolean;
  at: number;
};

const BUFFER_KEY = "xtdDrama.guessMetrics.buffer";
const MAX_BUFFER = 60;

function writeLocalBuffer(event: GuessMetricEvent) {
  try {
    const raw = window.sessionStorage.getItem(BUFFER_KEY);
    const prev = raw ? (JSON.parse(raw) as GuessMetricEvent[]) : [];
    const next = [...prev.slice(-(MAX_BUFFER - 1)), event];
    window.sessionStorage.setItem(BUFFER_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function sendToServer(event: GuessMetricEvent) {
  try {
    const body = JSON.stringify(event);
    if ("sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/metrics/guess", blob);
      return;
    }
    void fetch("/api/metrics/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

export function emitGuessMetric(
  event: GuessEvent,
  payload?: Omit<GuessMetricEvent, "event" | "at">
) {
  if (!imageMetricsEnabled()) return;
  if (typeof window === "undefined") return;
  const record: GuessMetricEvent = { event, at: Date.now(), ...payload };
  writeLocalBuffer(record);
  sendToServer(record);
}
