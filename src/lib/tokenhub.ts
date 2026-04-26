/**
 * tokenhub.ts — TokenHub（腾讯 MaaS）上游请求封装
 *
 * 目标：
 *  - 统一处理鉴权（Bearer Key）、超时、错误体解析与日志截断
 *  - 让各 API route 专注业务字段映射，而不是重复写 fetch 样板
 */

export interface TokenHubFetchOptions {
  /** 请求路径（不含 base url），例如：/v1/api/image/submit */
  path: string;
  /** POST JSON body */
  body: unknown;
}

export interface TokenHubError extends Error {
  status?: number;
  payload?: unknown;
}

const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL = process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
const TOKENHUB_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

function createError(message: string, status?: number, payload?: unknown): TokenHubError {
  const err = new Error(message) as TokenHubError;
  err.status = status;
  err.payload = payload;
  return err;
}

export function requireTokenHubKey(): string {
  if (!TOKENHUB_API_KEY) {
    throw createError("TOKENHUB_API_KEY 未配置", 500);
  }
  return TOKENHUB_API_KEY;
}

/**
 * 调用 TokenHub JSON API（仅 POST）
 *
 * 注意：TokenHub 的错误响应可能不是标准结构，这里优先 text() 再尝试 JSON.parse
 */
export async function tokenHubPost<T>(options: TokenHubFetchOptions): Promise<T> {
  requireTokenHubKey();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKENHUB_TIMEOUT_MS);

  try {
    const res = await fetch(`${TOKENHUB_BASE_URL}${options.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let payload: unknown = rawText;
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      // keep as text
    }

    if (!res.ok) {
      const snippet = typeof rawText === "string" ? rawText.slice(0, 300) : "";
      throw createError(`TokenHub 上游异常（${res.status}）: ${snippet}`, res.status, payload);
    }

    return payload as T;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw createError("TokenHub 请求超时", 504);
    }
    if (err instanceof Error) throw err as TokenHubError;
    throw createError("TokenHub 请求失败", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 调用 TokenHub GET 接口（OpenAI 兼容：/v1/models 等）
 */
export async function tokenHubGet<T>(path: string): Promise<T> {
  requireTokenHubKey();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKENHUB_TIMEOUT_MS);

  try {
    const res = await fetch(`${TOKENHUB_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      signal: controller.signal,
    });

    const rawText = await res.text();
    let payload: unknown = rawText;
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      // keep as text
    }

    if (!res.ok) {
      const snippet = typeof rawText === "string" ? rawText.slice(0, 300) : "";
      throw createError(`TokenHub 上游异常（${res.status}）: ${snippet}`, res.status, payload);
    }

    return payload as T;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw createError("TokenHub 请求超时", 504);
    }
    if (err instanceof Error) throw err as TokenHubError;
    throw createError("TokenHub 请求失败", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

