/**
 * /api/vision — YT-VITA 多模态图生文感知接口
 *
 * ═══════════════════════════════════════════════════════════════
 * 职责（对应 PRD「感知层 Perception Layer」）：
 *
 *   1. 接收前端传入的图片 base64 Data URL
 *   2. 调用 TokenHub YT-VITA 多模态大模型（OpenAI 兼容格式）
 *      — youtu-vita 是腾讯云 TokenHub 上唯一支持真实图片输入的模型
 *   3. 解析模型输出的纯 JSON 场景分析
 *   4. 返回结构化数据驱动前端「平庸白→Drama黑」双态切换
 *
 * 模型选择说明：
 *   youtu-vita（优图 VITA）是腾讯云 TokenHub 上经过验证的多模态视觉模型，
 *   能够真实理解图片内容（而非文本推理猜测）。
 *   调用端点：POST https://tokenhub.tencentmaas.com/v1/chat/completions
 *
 * 请求体（VisionRequestBody）：
 *   imageBase64  — 图片 Data URL（必填）
 *   userNote     — 用户附加文字描述（选填）
 *   model        — 可选临时覆盖（调试用，生产走 TOKENHUB_VITA_MODEL）
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { extractJSON } from "@/lib/extract-json";
import type {
  VisionRequestBody,
  VisionAnalysis,
  VisionSuccessResponse,
  VisionErrorResponse,
} from "@/types/vision";

/* ----------------------------------------------------------------
 * 环境变量
 * ---------------------------------------------------------------- */
const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL =
  process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
/** youtu-vita — TokenHub 上唯一经验证支持图片输入的多模态模型 */
const TOKENHUB_VITA_MODEL =
  process.env.TOKENHUB_VITA_MODEL ?? "youtu-vita";
const TOKENHUB_MAX_TOKENS = Number(process.env.TOKENHUB_MAX_TOKENS ?? "512");
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

/* ----------------------------------------------------------------
 * System Prompt — 「敏锐的场景观察者」
 *
 * 设计原则：
 *   1. 角色锁定：禁止模型输出任何非 JSON 内容
 *   2. 字段约束：强制输出 mainEntity / sceneState / userEmotion / styleHints
 *   3. 风格规范：精简、客观、中文
 *   4. 兜底：图片无法识别时输出预设 fallback JSON
 * ---------------------------------------------------------------- */
const SYSTEM_PROMPT = `你是一位极度敏锐、冷静客观的场景分析 AI，代号「观察者」。你具备真实的图像视觉理解能力，能直接"看懂"用户上传的图片。

## 核心任务
分析用户上传的图片，输出一段**纯 JSON 字符串**，精准描述图片中的场景状态与用户潜在情绪。

## 输出格式（严格遵守，禁止任何额外文字）
{"mainEntity":"<图像中最显著的核心主体，中文，≤20字>","sceneState":"<当前物理环境的客观状态，中文，≤30字，不含主观情绪>","userEmotion":"<基于场景推断的用户潜在情绪，1-2个中文词>","styleHints":["<夸张改写方向1>","<夸张改写方向2>","<夸张改写方向3>"]}

## 字段说明
- mainEntity: 你实际看到的核心主体，例如"堆满试卷的桌面"、"洒落在地的咖啡"、"挤满人的地铁"
- sceneState: 你看到的客观场景，例如"昏暗宿舍，屏幕蓝光，凌晨时分"
- userEmotion: 情绪标签，例如"焦虑"、"疲惫"、"无聊"、"崩溃"、"兴奋"
- styleHints: 3个极具网感的夸张化改写方向，例如["克苏鲁吞噬风","赛博牛马风","吉卜力治愈风"]

## 禁止事项
- 禁止在 JSON 之外输出任何文字或解释
- 禁止输出 Markdown 代码块（不要写 \`\`\`json）
- 禁止使用英文（所有值必须为中文）
- 若图片无法识别，输出：{"mainEntity":"未知场景","sceneState":"图像信息不足","userEmotion":"迷茫","styleHints":["抽象派","极简主义","超现实主义"]}`;

/* ----------------------------------------------------------------
 * 工具函数
 * ---------------------------------------------------------------- */

function errorResponse(
  code: VisionErrorResponse["code"],
  message: string,
  status: number = 400
): NextResponse<VisionErrorResponse> {
  return NextResponse.json<VisionErrorResponse>(
    { success: false, error: message, code },
    { status }
  );
}

/** 校验 base64 Data URL 格式前缀 */
function validateBase64(base64: string): boolean {
  return /^data:image\/(jpeg|png|jpg|webp);base64,/.test(base64);
}

/* ----------------------------------------------------------------
 * 主路由处理器
 * ---------------------------------------------------------------- */

export async function POST(req: NextRequest): Promise<NextResponse> {
  /* 1. 环境变量检查 */
  if (!TOKENHUB_API_KEY) {
    console.error("[vision] TOKENHUB_API_KEY 未配置");
    return errorResponse("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
  }

  /* 2. 解析请求体 */
  let body: VisionRequestBody;
  try {
    body = (await req.json()) as VisionRequestBody;
  } catch {
    return errorResponse("MISSING_IMAGE", "请求体格式错误，需要 JSON");
  }

  const { imageBase64, userNote, model } = body;

  if (!imageBase64) {
    return errorResponse("MISSING_IMAGE", "缺少图片数据（imageBase64）");
  }
  if (!validateBase64(imageBase64)) {
    return errorResponse("INVALID_BASE64", "图片格式不合法，仅支持 JPG/PNG 的 base64 Data URL");
  }

  /* 3. 选定模型（支持请求体临时覆盖，用于调试） */
  const selectedModel = model?.trim() || TOKENHUB_VITA_MODEL;

  /* 4. 构造 OpenAI 兼容多模态消息 */
  const userContent: Array<{ type: string; [key: string]: unknown }> = [
    {
      type: "image_url",
      image_url: { url: imageBase64 },
    },
    {
      type: "text",
      text: userNote?.trim()
        ? `用户补充描述：「${userNote.trim()}」\n\n请分析这张图片，输出纯 JSON。`
        : "请仔细观察并分析这张图片，输出纯 JSON（不要有任何其他文字）。",
    },
  ];

  const requestPayload = {
    model: selectedModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: TOKENHUB_MAX_TOKENS,
    temperature: 0.1,  // 极低随机性，保证 JSON 输出稳定
    stream: false,
  };

  /* 5. 调用上游 API（带超时） */
  let rawContent: string;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    const baseUrl = TOKENHUB_BASE_URL.endsWith("/")
      ? TOKENHUB_BASE_URL.slice(0, -1)
      : TOKENHUB_BASE_URL;

    const upstreamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => upstreamRes.statusText);
      console.error(`[vision] 上游 API ${upstreamRes.status}:`, errText.slice(0, 300));
      return errorResponse(
        "UPSTREAM_ERROR",
        `大模型服务异常（${upstreamRes.status}）：${errText.slice(0, 200)}`,
        502
      );
    }

    const upstreamData = (await upstreamRes.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      error?: { message: string };
    };

    if (upstreamData.error) {
      console.error("[vision] 上游业务错误：", upstreamData.error);
      return errorResponse("UPSTREAM_ERROR", `模型返回错误：${upstreamData.error.message}`, 502);
    }

    rawContent = upstreamData.choices?.[0]?.message?.content ?? "";

    if (!rawContent) {
      console.error("[vision] 模型返回内容为空", upstreamData);
      return errorResponse("UPSTREAM_ERROR", "模型返回内容为空", 502);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return errorResponse("TIMEOUT", "AI 感知超时，请稍后重试", 504);
    }
    console.error("[vision] fetch 异常：", err);
    return errorResponse("UPSTREAM_ERROR", "连接大模型服务失败", 502);
  }

  /* 6. 解析 JSON */
  let analysis: VisionAnalysis;

  try {
    const jsonStr = extractJSON(rawContent);
    const parsed = JSON.parse(jsonStr) as Partial<VisionAnalysis> & {
      description?: string;
    };

    if (parsed.mainEntity && parsed.sceneState && parsed.userEmotion) {
      analysis = {
        mainEntity: String(parsed.mainEntity).trim(),
        sceneState: String(parsed.sceneState).trim(),
        userEmotion: String(parsed.userEmotion).trim(),
        styleHints: Array.isArray(parsed.styleHints)
          ? parsed.styleHints.map(String).slice(0, 3)
          : undefined,
      };
    } else if (typeof parsed.description === "string" && parsed.description.trim()) {
      /* youtu-vita 偶发只输出 { description }，与契约不一致时从长描述映射为感知结构 */
      const d = parsed.description.trim();
      analysis = {
        mainEntity: d.slice(0, 20),
        sceneState: d.slice(0, Math.min(40, d.length)),
        userEmotion: "好奇",
        styleHints: Array.isArray(parsed.styleHints)
          ? parsed.styleHints.map(String).slice(0, 3)
          : ["网络化夸张", "反差戏剧感", "梗图化表达"],
      };
    } else {
      throw new Error(`缺少必要字段：${JSON.stringify(parsed).slice(0, 120)}`);
    }
  } catch (err) {
    console.error("[vision] JSON 解析失败，原始输出：", rawContent, err);
    return errorResponse("PARSE_ERROR", "AI 返回格式异常，解析失败", 500);
  }

  /* 7. 返回结果 */
  const response: VisionSuccessResponse = {
    success: true,
    data: analysis,
    ...(process.env.NODE_ENV === "development" && { rawContent }),
  };

  return NextResponse.json<VisionSuccessResponse>(response, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
