/**
 * video.ts — HY-Video（TokenHub）相关类型（前后端共享）
 *
 * 对应 TokenHub 图生视频接口：
 *   - POST /v1/api/video/submit
 *   - POST /v1/api/video/query
 *
 * 调用示例（官方文档）：
 *   提交：{ "model": "hy-video-1.5", "prompt": "一只小狗" }
 *   查询：{ "model": "hy-video-1.5", "id": "xxxxxx" }
 */

export interface VideoSubmitBody {
  /** 视频生成模型名，默认 hy-video-1.5 */
  model?: string;
  /** 文本描述，用于驱动视频生成 */
  prompt: string;
  /**
   * 参考图 URL 列表（可公网访问）。服务端会取首张映射为 TokenHub 要求的
   * `image: { url }`（混元 SubmitHunyuanToVideoJob 的 Image 结构），勿直接传 `images` 数组给上游。
   */
  images?: string[];
}

export interface VideoSubmitResponse {
  /** 任务 ID，用于 query 轮询 */
  id: string;
  /** 任务初始状态 */
  status?: string;
  [key: string]: unknown;
}

export interface VideoQueryBody {
  model?: string;
  id: string;
}

export interface VideoQueryResponse {
  /** 任务状态：queued / processing / completed / failed */
  status?: string;
  /** 生成的视频数据（completed 时出现） */
  data?: Array<{
    url?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export type VideoApiOk<T> = { success: true; data: T };
export type VideoApiFail = {
  success: false;
  error: string;
  code: "API_KEY_MISSING" | "INVALID_INPUT" | "UPSTREAM_ERROR" | "TIMEOUT" | "UNKNOWN";
};
export type VideoApiResponse<T> = VideoApiOk<T> | VideoApiFail;
