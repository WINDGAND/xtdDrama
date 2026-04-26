/**
 * vision.ts — 视觉分析相关类型定义（前后端共享）
 *
 * 这些类型描述了「感知层」（Perception Layer）的数据契约：
 *   前端发送 → API 路由 → 混元 Vision 模型 → 解析 → 返回给前端
 *
 * 字段设计原则（与 PRD 感知层输出对齐）：
 *   - mainEntity   : 图像中的核心被摄主体，是后续 ControlNet 锁定的对象
 *   - sceneState   : 场景的物理/环境状态，用于生成"戏剧化背景"
 *   - userEmotion  : 推断的用户潜在情绪，驱动 Guess & Refine 风格匹配
 *   - styleHints   : 可选——模型额外提供的夸张化方向建议（为下一任务预留）
 */

/* ----------------------------------------------------------------
 * 前端 → API 请求体
 * ---------------------------------------------------------------- */
export interface VisionRequestBody {
  /** 图片的 base64 Data URL，格式：data:image/jpeg;base64,... */
  imageBase64: string;
  /** 用户可选的附加文字描述（对应 PRD"一句话吐槽"） */
  userNote?: string;
  /**
   * 可选：临时指定本次请求使用的模型名（仅用于调试/探测）
   * 若不传，则使用服务端环境变量 TOKENHUB_VISION_MODEL
   */
  model?: string;
}

/* ----------------------------------------------------------------
 * 混元模型输出的核心分析结构（JSON Schema）
 * ---------------------------------------------------------------- */
export interface VisionAnalysis {
  /** 主实体：图像中最显著的核心对象/主体，精简描述（≤20字） */
  mainEntity: string;

  /** 场景状态：当前物理环境的客观描述（≤30字），不含主观情绪 */
  sceneState: string;

  /** 用户潜在情绪：基于场景推断的情绪标签，1-2个词，中文 */
  userEmotion: string;

  /**
   * 风格提示（可选，为"Guess & Refine"任务预留）
   * 模型自发建议的 1-3 个夸张化改写方向关键词
   */
  styleHints?: string[];
}

/* ----------------------------------------------------------------
 * API 路由成功响应
 * ---------------------------------------------------------------- */
export interface VisionSuccessResponse {
  success: true;
  data: VisionAnalysis;
  /** 模型原始输出（调试用，生产环境可关闭） */
  rawContent?: string;
}

/* ----------------------------------------------------------------
 * API 路由错误响应
 * ---------------------------------------------------------------- */
export interface VisionErrorResponse {
  success: false;
  error: string;
  /** 错误代码，用于前端分支处理 */
  code:
    | "MISSING_IMAGE"      // 未传图片
    | "INVALID_BASE64"     // base64 格式异常
    | "API_KEY_MISSING"    // 环境变量未配置
    | "MODEL_MISSING"      // Vision 模型未配置
    | "UPSTREAM_ERROR"     // 上游 API 调用失败
    | "PARSE_ERROR"        // 模型输出解析失败
    | "TIMEOUT"            // 请求超时
    | "UNKNOWN";           // 未知错误
}

/* ----------------------------------------------------------------
 * 联合类型：API 路由统一响应
 * ---------------------------------------------------------------- */
export type VisionResponse = VisionSuccessResponse | VisionErrorResponse;
