/**
 * image.ts — HY-Image（TokenHub）相关类型（前后端共享）
 *
 * 对应你提供的接口：
 *   - POST /v1/api/image/submit
 *   - POST /v1/api/image/query
 */

export interface ImageSubmitBody {
  model?: string;
  prompt: string;
  /**
   * 参考图 URL 列表（HY-Image-V3.0 支持）
   * 文档要求为「可公网访问的图片地址」
   */
  images?: string[];
}

export interface ImageSubmitResponse {
  /** 任务 ID，用于 query 轮询 */
  id: string;
  /** 上游可能包含的额外字段 */
  [key: string]: unknown;
}

export interface ImageQueryBody {
  model?: string;
  id: string;
}

export interface ImageQueryResponse {
  /** 任务状态字段（不同版本可能命名不同，先保留 unknown） */
  status?: string;
  /** 结果（可能是图片 url/base64 等） */
  result?: unknown;
  [key: string]: unknown;
}

export type ApiOk<T> = { success: true; data: T };
export type ApiFail = {
  success: false;
  error: string;
  code: "API_KEY_MISSING" | "INVALID_INPUT" | "UPSTREAM_ERROR" | "TIMEOUT" | "UNKNOWN";
};
export type ApiResponse<T> = ApiOk<T> | ApiFail;

