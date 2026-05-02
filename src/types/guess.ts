/**
 * guess.ts — AI 决策引擎「Guess & Refine」相关类型（前后端共享）
 *
 * 数据契约：
 *   /api/guess 接收 Vision 感知结构，返回：
 *     reply   — 一句共情/俏皮/旁白式点评（克制自然，击中情绪）
 *     options — 3 个针对当前图片自由生成的轻度 Drama 改造方向，每项含中文叙事体生图指令
 */

import type { VisionAnalysis } from "@/types/vision";

/* ----------------------------------------------------------------
 * 候选签名（用于换一批去重）
 * ---------------------------------------------------------------- */
export interface GuessOptionSignature {
  title: string;
  prompt: string;
  description?: string;
}

/* ----------------------------------------------------------------
 * 请求体
 * ---------------------------------------------------------------- */
export interface GuessRequestBody {
  /** 来自 /api/vision 的结构化感知结果 */
  analysis: VisionAnalysis;
  /** 可选：临时覆盖模型名（调试用，生产走 TOKENHUB_GUESS_MODEL） */
  model?: string;
  /** 换一批：需要排除的历史候选签名，后端做规则去重 */
  exclude?: GuessOptionSignature[];
  /** 当前是第几批（从 1 开始），传给后端用于 prompt 差异化约束 */
  batchIndex?: number;
  /** 用户自定义偏好输入（2-40字），用于"我自己说一句"功能 */
  userHint?: string;
  /**
   * 请求模式：
   * - "recommend"（默认）：基于 userHint 重新推荐 3 个候选
   * - "direct"：基于 userHint 直接生成，跳过三选一，后端只返回单条 option
   */
  mode?: "recommend" | "direct";
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
   * 中文方向说明：10-20字，描述「哪个元素」以「什么方式」发生了「多轻度」的变化。
   * 融入图中具体元素词，体现专属感，用于前端展示。
   */
  description?: string;
  /**
   * 中文叙事体生图指令，供图像生成模型直接使用。
   * 格式：（锚定指令）+ 场景还原 + Drama 改造描述 + 质感收尾。
   * 前端可展开查看原文。
   */
  prompt: string;
}

/* ----------------------------------------------------------------
 * 模型输出的核心结构
 * ---------------------------------------------------------------- */
export interface GuessResult {
  /** 破冰回复：一句共情/俏皮/旁白式点评，克制自然，击中情绪 */
  reply: string;
  /** 3 个风格选项（direct 模式下只有 1 个） */
  options: GuessOption[];
}

/* ----------------------------------------------------------------
 * 响应 meta（用于前端批次感知与埋点）
 * ---------------------------------------------------------------- */
export interface GuessResponseMeta {
  /** 当前是第几批推荐（从 1 开始） */
  batchIndex: number;
  /** 去重策略命中级别 */
  dedupLevel: "none" | "rule" | "semantic" | "fallback";
  /** 是否应用了 userHint */
  hasUserHint: boolean;
}

/* ----------------------------------------------------------------
 * API 成功响应
 * ---------------------------------------------------------------- */
export interface GuessSuccessResponse {
  success: true;
  data: GuessResult;
  meta: GuessResponseMeta;
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
