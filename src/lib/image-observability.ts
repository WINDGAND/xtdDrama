"use client";

import { imageMetricsEnabled } from "@/lib/image-flags";

type ImageMetricEvent = {
  event: "load" | "error";
  page: string;
  slot: string;
  srcHost: string;
  durationMs?: number;
  reason?: string;
  at: number;
};

const BUFFER_KEY = "xtdDrama.imageMetrics.buffer";
const MAX_BUFFER = 120;

function parseHost(src: string) {
  if (!src) return "unknown";
  if (src.startsWith("data:")) return "data-url";
  try {
    return new URL(src, window.location.origin).host || "unknown";
  } catch {
    return "unknown";
  }
}

function writeLocalBuffer(event: ImageMetricEvent) {
  try {
    const raw = window.sessionStorage.getItem(BUFFER_KEY);
    const prev = raw ? (JSON.parse(raw) as ImageMetricEvent[]) : [];
    const next = [...prev.slice(-(MAX_BUFFER - 1)), event];
    window.sessionStorage.setItem(BUFFER_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function sendToServer(event: ImageMetricEvent) {
  try {
    const body = JSON.stringify(event);
    if ("sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/metrics/image", blob);
      return;
    }
    void fetch("/api/metrics/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

export function emitImageMetric(input: Omit<ImageMetricEvent, "srcHost" | "at"> & { src: string }) {
  if (!imageMetricsEnabled()) return;
  if (typeof window === "undefined") return;
  const event: ImageMetricEvent = {
    event: input.event,
    page: input.page,
    slot: input.slot,
    durationMs: input.durationMs,
    reason: input.reason,
    srcHost: parseHost(input.src),
    at: Date.now(),
  };
  writeLocalBuffer(event);
  sendToServer(event);
}
