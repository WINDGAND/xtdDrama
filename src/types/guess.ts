/**
 * guess.ts — AI 决策引擎「Guess & Refine」相关类型（前后端共享）
 *
 * 数据契约：
 *   /api/guess 接收 Vision 感知结构，返回：
 *     reply   — 一句 Z 世代发疯文学破冰吐槽
 *     options — 3 个夸张戏剧化风格，每项含英文 SDXL 风格 prompt
 */

import type { VisionAnalysis } from "@/types/vision";

/* ----------------------------------------------------------------
 * 请求体
 * ---------------------------------------------------------------- */
export interface GuessRequestBody {
  /** 来自 /api/vision 的结构化感知结果 */
  analysis: VisionAnalysis;
  /** 可选：临时覆盖模型名（调试用，生产走 TOKENHUB_GUESS_MODEL） */
  model?: string;
}

/* ----------------------------------------------------------------
 * 单个风格选项
 * ---------------------------------------------------------------- */
export interface GuessOption {
  /** 选项编号 1–3 */
  id: number;
  /** 中文夸张风格名称，例如「赛博牛马风」 */
  title: string;
  /**
   * 英文 SDXL 风格提示词，必须含高对比/光影词缀：
   *   cinematic lighting, neon glow, neon accents, high contrast, dramatic chiaroscuro…
   */
  prompt: string;
}

/* ----------------------------------------------------------------
 * 模型输出的核心结构
 * ---------------------------------------------------------------- */
export interface GuessResult {
  /** 破冰回复：一句击中用户情绪的 Z 世代发疯文学吐槽 */
  reply: string;
  /** 3 个风格选项 */
  options: GuessOption[];
}

/* ----------------------------------------------------------------
 * API 成功响应
 * ---------------------------------------------------------------- */
export interface GuessSuccessResponse {
  success: true;
  data: GuessResult;
  /** 模型原始输出（开发环境附带，生产关闭） */
  rawContent?: string;
}

/* ----------------------------------------------------------------
 * API 错误响应
 * ---------------------------------------------------------------- */
export interface GuessErrorResponse {
  success: false;
  error: string;
  code:
    | "API_KEY_MISSING"
    | "INVALID_INPUT"
    | "UPSTREAM_ERROR"
    | "PARSE_ERROR"
    | "TIMEOUT"
    | "UNKNOWN";
}

export type GuessResponse = GuessSuccessResponse | GuessErrorResponse;
