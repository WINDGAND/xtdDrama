/**
 * tokenhub.ts — TokenHub（腾讯 MaaS）上游请求封装
 *
 * 目标：
 *  - 统一处理鉴权（Bearer Key）、超时、错误体解析与日志截断
 *  - 让各 API route 专注业务字段映射，而不是重复写 fetch 样板
 *
 * 重试策略（P0 稳定性加固）：
 *  - 429 / 5xx 自动重试一次，指数退避（500ms → 1000ms）
 *  - 4xx（非 429）不重试
 *  - AbortError（超时）不重试
 */

export interface TokenHubFetchOptions {
  /** 请求路径（不含 base url），例如：/v1/api/image/submit */
  path: string;
  /** POST JSON body */
  body: unknown;
  /** 是否在 429/5xx 时重试（默认 true） */
  retry?: boolean;
}

export interface TokenHubError extends Error {
  status?: number;
  payload?: unknown;
  /** 是否是 rate-limit 错误（429） */
  isRateLimit?: boolean;
}

const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL = process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
const TOKENHUB_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");
const RETRY_DELAYS_MS = [500, 1000] as const;

function createError(message: string, status?: number, payload?: unknown): TokenHubError {
  const err = new Error(message) as TokenHubError;
  err.status = status;
  err.payload = payload;
  err.isRateLimit = status === 429;
  return err;
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
 * 注意：TokenHub 的错误响应可能不是标准结构，这里优先 text() 再尝试 JSON.parse。
 * 429 / 5xx 时自动重试一次，带指数退避。
 */
export async function tokenHubPost<T>(options: TokenHubFetchOptions): Promise<T> {
  requireTokenHubKey();

  const shouldRetryOnError = options.retry !== false;
  const baseUrl = TOKENHUB_BASE_URL.endsWith("/")
    ? TOKENHUB_BASE_URL.slice(0, -1)
    : TOKENHUB_BASE_URL;

  let lastErr: TokenHubError | null = null;

  for (let attempt = 0; attempt <= 1; attempt++) {
    if (attempt > 0) {
      if (!shouldRetryOnError || !lastErr || !shouldRetry(lastErr.status ?? 0)) break;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TOKENHUB_TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}${options.path}`, {
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
        const err = createError(
          res.status === 429
            ? `TokenHub 请求频率超限，请稍后重试（${res.status}）`
            : `TokenHub 上游异常（${res.status}）: ${snippet}`,
          res.status,
          payload
        );
        lastErr = err;
        continue;
      }

      return payload as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw createError("TokenHub 请求超时", 504);
      }
      if (err instanceof Error) {
        const te = err as TokenHubError;
        // 已是 TokenHubError（来自上方的 createError 没有被 throw），直接抛出
        throw te;
      }
      throw createError("TokenHub 请求失败", 502);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastErr ?? createError("TokenHub 请求失败", 502);
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

