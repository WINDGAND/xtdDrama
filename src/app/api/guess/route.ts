/**
 * /api/guess — AI 决策引擎「吐槽 + 风格三选」接口
 *
 * 职责（对应 PRD「Guess & Refine 层」）：
 *   1. 接收 Vision 感知结构（mainEntity / sceneState / userEmotion）
 *   2. 调用 TokenHub 混元文本模型（chat/completions）
 *   3. 返回结构化 JSON：
 *      - reply   : Z 世代发疯文学破冰吐槽（一句话，击中情绪）
 *      - options : 3 个夸张戏剧化生图风格，每项含英文 SDXL 风格 prompt
 *
 * 模型配置：
 *   TOKENHUB_GUESS_MODEL（默认 hunyuan-2.0-instruct-20251111，见官方「文本生成」文档）
 *   其他常见可用 ID：hunyuan-2.0-thinking-20251109、hunyuan-role-latest、hy3-preview
 *   若仍报 model not found，请在控制台确认当前 API Key 已开通对应服务。
 */

import { NextRequest, NextResponse } from "next/server";
import { extractJSON } from "@/lib/extract-json";
import type {
  GuessRequestBody,
  GuessResult,
  GuessOption,
  GuessSuccessResponse,
  GuessErrorResponse,
} from "@/types/guess";

/* ----------------------------------------------------------------
 * 环境变量
 * ---------------------------------------------------------------- */
const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL =
  process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
/**
 * 混元文本模型（chat/completions）。
 * 默认与 TokenHub 文档示例一致；勿使用已下线或无效 ID（如 hunyuan-turbos-latest）。
 */
const TOKENHUB_GUESS_MODEL =
  process.env.TOKENHUB_GUESS_MODEL ?? "hunyuan-2.0-instruct-20251111";
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

/* ----------------------------------------------------------------
 * System Prompt — 「Z 世代发疯文学 AI 吐槽机器」
 * ---------------------------------------------------------------- */
const SYSTEM_PROMPT = `你是一个深谙 Z 世代发疯文学的 AI 吐槽机器，代号「Drama 引擎」。你的任务是针对用户上传的日常场景，给出一个极具网感、精准戳中情绪的破冰回复，并提供三个夸张戏剧化的视觉风格方向。

## 核心任务
根据用户提供的场景感知 JSON，输出**纯 JSON 字符串**，格式如下：
{"reply":"<一句击中用户情绪的 Z 世代发疯文学吐槽，中文，20-50字，带网感和幽默感>","options":[{"id":1,"title":"<中文夸张风格名称，如：赛博牛马风>","prompt":"<英文 SDXL 风格提示词，必须包含光影词缀>"},{"id":2,"title":"<中文夸张风格名称>","prompt":"<英文 SDXL 风格提示词，必须包含光影词缀>"},{"id":3,"title":"<中文夸张风格名称>","prompt":"<英文 SDXL 风格提示词，必须包含光影词缀>"}]}

## reply 创作原则
- 一句话，简短有力，带强烈网络情绪共鸣
- 使用当下 Z 世代流行语：打工人、emo、整顿、牛马、破防、精神内耗、纯纯、绷不住等
- 配合用户情绪，可夸张、可自嘲、可癫狂，但不能负能量到令人不适
- 例如：「这种程度还不够绷，等 DDL 凌晨三点你就懂了」

## options 创作原则
- title：3–6 个中文字，极具画面感和网感，例如「克苏鲁吞噬风」「赛博牛马风」「地狱使者风」
- prompt：英文，40–80 词，必须包含以下光影词缀中的至少 3 个：
  cinematic lighting, neon glow, neon accents, high contrast, dramatic chiaroscuro,
  volumetric light, rim lighting, lens flare, dark atmospheric, cyberpunk aesthetic
- prompt 需精准描述该风格的视觉特征，以控制 SDXL/混元生图引擎产出暗黑或高反差画风
- 三个风格需各有差异，覆盖不同审美取向

## 禁止事项
- 禁止在 JSON 之外输出任何文字、解释或 markdown
- 禁止输出 \`\`\`json 代码块
- 禁止 options 少于或多于 3 个
- prompt 字段必须为英文`;

/* ----------------------------------------------------------------
 * 工具函数
 * ---------------------------------------------------------------- */
function errorResponse(
  code: GuessErrorResponse["code"],
  message: string,
  status = 400
): NextResponse<GuessErrorResponse> {
  return NextResponse.json<GuessErrorResponse>(
    { success: false, error: message, code },
    { status }
  );
}

function isValidOption(o: unknown): o is GuessOption {
  if (typeof o !== "object" || o === null) return false;
  const obj = o as Record<string, unknown>;
  return (
    typeof obj.id === "number" &&
    typeof obj.title === "string" && obj.title.trim().length > 0 &&
    typeof obj.prompt === "string" && obj.prompt.trim().length > 0
  );
}

/* ----------------------------------------------------------------
 * 主路由处理器
 * ---------------------------------------------------------------- */
export async function POST(req: NextRequest): Promise<NextResponse> {
  /* 1. 环境变量检查 */
  if (!TOKENHUB_API_KEY) {
    return errorResponse("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
  }

  /* 2. 解析请求体 */
  let body: GuessRequestBody;
  try {
    body = (await req.json()) as GuessRequestBody;
  } catch {
    return errorResponse("INVALID_INPUT", "请求体格式错误，需要 JSON");
  }

  const { analysis, model } = body;

  if (
    !analysis?.mainEntity?.trim() ||
    !analysis?.sceneState?.trim() ||
    !analysis?.userEmotion?.trim()
  ) {
    return errorResponse(
      "INVALID_INPUT",
      "缺少 analysis 字段（mainEntity / sceneState / userEmotion）"
    );
  }

  /* 3. 选定模型 */
  const selectedModel = model?.trim() || TOKENHUB_GUESS_MODEL;

  /* 4. 构造消息 */
  const userContent = [
    "以下是用户当前场景的感知数据（JSON），请严格按照 System Prompt 格式输出纯 JSON，不要任何额外文字：",
    JSON.stringify({
      mainEntity: analysis.mainEntity,
      sceneState: analysis.sceneState,
      userEmotion: analysis.userEmotion,
      ...(analysis.styleHints?.length ? { styleHints: analysis.styleHints } : {}),
    }),
  ].join("\n\n");

  const requestPayload = {
    model: selectedModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 800,
    temperature: 0.85,
    stream: false,
  };

  /* 5. 调用上游 API */
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
      console.error(`[guess] 上游 API ${upstreamRes.status}:`, errText.slice(0, 300));
      return errorResponse(
        "UPSTREAM_ERROR",
        `大模型服务异常（${upstreamRes.status}）：${errText.slice(0, 200)}`,
        502
      );
    }

    const upstreamData = (await upstreamRes.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string };
      }>;
      error?: { message: string };
    };

    if (upstreamData.error) {
      return errorResponse("UPSTREAM_ERROR", `模型返回错误：${upstreamData.error.message}`, 502);
    }

    const msg = upstreamData.choices?.[0]?.message as
      | { content?: string; reasoning_content?: string }
      | undefined;
    const content = typeof msg?.content === "string" ? msg.content.trim() : "";
    const reasoning =
      typeof msg?.reasoning_content === "string" ? msg.reasoning_content.trim() : "";
    /* hy3 等模型可能把正文放在 reasoning_content */
    rawContent = content || reasoning;
    if (!rawContent) {
      return errorResponse("UPSTREAM_ERROR", "模型返回内容为空", 502);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return errorResponse("TIMEOUT", "AI 决策超时，请稍后重试", 504);
    }
    console.error("[guess] fetch 异常：", err);
    return errorResponse("UPSTREAM_ERROR", "连接大模型服务失败", 502);
  }

  /* 6. 解析与校验 JSON */
  let result: GuessResult;

  try {
    const jsonStr = extractJSON(rawContent);
    const parsed = JSON.parse(jsonStr) as Partial<GuessResult>;

    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      throw new Error("reply 字段缺失或为空");
    }
    if (!Array.isArray(parsed.options) || parsed.options.length !== 3) {
      throw new Error(`options 应为 3 项数组，实际：${JSON.stringify(parsed.options)?.slice(0, 80)}`);
    }
    if (!parsed.options.every(isValidOption)) {
      throw new Error("options 中存在非法项（缺少 id/title/prompt）");
    }

    result = {
      reply: parsed.reply.trim(),
      options: (parsed.options as GuessOption[]).map((o) => ({
        id: Number(o.id),
        title: String(o.title).trim(),
        prompt: String(o.prompt).trim(),
      })),
    };
  } catch (err) {
    console.error("[guess] JSON 解析失败，原始输出：", rawContent, err);
    return errorResponse("PARSE_ERROR", "AI 返回格式异常，解析失败", 500);
  }

  /* 7. 返回结果 */
  const response: GuessSuccessResponse = {
    success: true,
    data: result,
    ...(process.env.NODE_ENV === "development" && { rawContent }),
  };

  return NextResponse.json<GuessSuccessResponse>(response, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
