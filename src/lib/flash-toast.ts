import type { ToastTone } from "@/components/ui/toast";

export const FLASH_TOAST_KEY = "xtdDrama.flashToast";

export type FlashToastPayload = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

export function pushFlashToast(payload: FlashToastPayload | string) {
  try {
    if (!payload) return;
    const value =
      typeof payload === "string"
        ? payload
        : JSON.stringify(payload);
    if (!value) return;
    window.sessionStorage.setItem(FLASH_TOAST_KEY, value);
  } catch {
    // ignore
  }
}

export function consumeFlashToast(): FlashToastPayload | null {
  try {
    const raw = window.sessionStorage.getItem(FLASH_TOAST_KEY) ?? "";
    if (raw) window.sessionStorage.removeItem(FLASH_TOAST_KEY);
    if (!raw) return null;

    // 兼容旧版本：直接存 string
    if (!raw.trim().startsWith("{")) return { title: raw };

    const obj = JSON.parse(raw) as Partial<FlashToastPayload>;
    const title = typeof obj.title === "string" ? obj.title : "";
    if (!title) return null;
    return {
      title,
      description: typeof obj.description === "string" ? obj.description : undefined,
      tone: obj.tone === "success" || obj.tone === "error" || obj.tone === "info" ? obj.tone : undefined,
      durationMs: typeof obj.durationMs === "number" ? obj.durationMs : undefined,
    };
  } catch {
    return null;
  }
}

