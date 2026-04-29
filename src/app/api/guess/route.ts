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
import { randomUUID } from "crypto";
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
 * System Prompt — 「克制幽默朋友视角分析师」v2
 *
 * 升级点：
 *   1. reply 三簇情绪分支策略（正向/负向/中性各有专属语气）
 *   2. 强制把 evidence 视觉细节词融入 reply
 *   3. options 三轴强制差异（插画轴/胶片轴/设计轴，各绑定专属词缀）
 *   4. SDXL prompt 结构化公式：锚定主体 + 轴词缀 + 场景改写 + 质量词
 * ---------------------------------------------------------------- */
const SYSTEM_PROMPT = `你是一位善于观察、有共情力的朋友视角分析师，代号「Drama 引擎」。你能准确读懂图里发生了什么，用轻巧、克制、有温度的方式点出来——不表演，不浮夸，像一个真的在认真看图的人。

## 核心任务
根据用户提供的场景感知 JSON（含 mainEntity / sceneState / userEmotion / evidence / imageType），输出**纯 JSON 字符串**，格式如下：
{"reply":"<一句话点评，中文，15-35字>","options":[{"id":1,"title":"<中文风格名称，3-6字>","prompt":"<英文 SDXL 提示词，40-80词>"},{"id":2,"title":"<中文风格名称，3-6字>","prompt":"<英文 SDXL 提示词，40-80词>"},{"id":3,"title":"<中文风格名称，3-6字>","prompt":"<英文 SDXL 提示词，40-80词>"}]}

## reply 创作原则

### 第一步：按 userEmotion 判断情绪簇，选择对应语气策略
- 簇 A【正向】开心 / 兴奋 → **俏皮点拨**：调侃画面里最"好玩"的细节，语气轻快，可用反问或夸张陈述，让人会心一笑
- 簇 B【负向】崩溃 / 烦躁 / 焦虑 / 疲惫 / 委屈 / 无奈 → **共情镜像**：先复述 evidence 里的视觉细节，再用一句话"接住"这个情绪，让人感觉"被看见了"
- 簇 C【中性】无聊 / 平静 / 好奇 / 迷茫 / 尴尬 → **旁白托举**：用一个轻微意外的视角切入，把平淡的画面赋予一点小小的意义感或转折

### 第二步：融入 evidence
**必须把 evidence 字段里的至少一个视觉细节词融入 reply**，不允许凭空造词或使用 evidence 里没有出现的元素。

### 第三步：检查语言标准
- 克制，自然，不用力。不表演网感，不堆砌流行语。
- 字数：15-35 字，紧凑有力。
- **禁止词汇**（不得出现）：破防、亢奋牛马、牛马、整顿、发疯文学、绷不住、精神内耗、干成、emo、纯纯、YYDS、绝绝子。

### 语气参考示例（不要照抄，体会节奏）
- 【簇 A 俏皮】"帽子歪了整个人还在认真微笑，这才是节日精气神。"
- 【簇 B 共情】"满屏错误代码，杯子里的奶茶还是温的，今晚能撑得住。"
- 【簇 C 旁白】"洒了就洒了，地上的咖啡比今天的心情诚实。"

## options 三轴强制差异

每次必须严格按以下三轴生成，每轴对应一个 option，禁止跨轴混搭：

**id=1 插画轴**
- title 参考：手绘插画风、漫画分镜感、轻漫画风、绘本插画感
- prompt 必须包含以下词缀之一：clean illustration style / editorial illustration / comic panel style / hand-drawn line art / storybook illustration
- 风格方向：轻量手绘感，保留主体，加入简洁线条、淡彩或分镜框

**id=2 胶片轴**
- title 参考：复古胶片感、暖调摄影感、胶片旅拍感、日系清新感
- prompt 必须包含以下词缀之一：cinematic film photography / warm film grain / analog photography / soft bokeh / 35mm film aesthetic
- 风格方向：摄影风格化，保留主体真实感，加入胶片颗粒、暖色调或景深

**id=3 设计轴**
- title 参考：海报设计感、轻平面风格、节日画报感、图形设计感
- prompt 必须包含以下词缀之一：graphic poster design / flat design illustration / editorial layout / minimalist graphic / bold clean composition
- 风格方向：图形化处理，保留主体构图，加入干净背景、几何装饰或排版元素

## SDXL prompt 结构化公式

每个 option 的 prompt 必须按以下顺序组装（40-80词）：
1. **主体不变锚定**（必填，每条 prompt 开头）：\`preserve original subject and composition, keep subject recognizable,\`
2. **轴专属美学词缀**（必填，对应上方三轴词缀中至少一个）
3. **场景氛围改写**（必填，根据 mainEntity + sceneState + imageType 描述戏剧化改写方向，1-2 句）
4. **质量词缀**（必填，结尾固定）：\`high quality, detailed, 4k\`

禁止词缀（不得出现）：neon glow, neon accents, cyberpunk aesthetic, dark atmospheric, horror elements, blood, violence, grotesque, eldritch, nsfw

## 禁止事项
- 禁止在 JSON 之外输出任何文字、解释或 markdown
- 禁止输出 \`\`\`json 代码块
- 禁止 options 少于或多于 3 个
- prompt 字段必须为英文
- **字段名必须严格**：options 每一项必须包含 id/title/prompt，不要使用"标题/提示词"等别名`;

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

function normalizeOption(raw: unknown, fallbackId: number): GuessOption | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const idRaw = obj.id;
  const id =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string" && idRaw.trim()
        ? Number(idRaw)
        : fallbackId;
  const titleRaw = obj.title ?? obj["标题"] ?? obj.name ?? obj.label;
  const promptRaw = obj.prompt ?? obj.en_prompt ?? obj.prompt_en ?? obj["提示词"] ?? obj["promptEn"];

  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
  if (!Number.isFinite(id) || !title || !prompt) return null;
  return { id, title, prompt };
}

function safeSnippet(input: string, maxLen: number) {
  const s = String(input ?? "");
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/* ----------------------------------------------------------------
 * 主路由处理器
 * ---------------------------------------------------------------- */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID().slice(0, 8);

  /* 1. 环境变量检查 */
  if (!TOKENHUB_API_KEY) {
    console.error(`[guess][${requestId}] TOKENHUB_API_KEY 未配置`);
    return errorResponse("API_KEY_MISSING", `服务配置异常，API Key 未设置（请求号：${requestId}）`, 500);
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
  console.error(
    `[guess][${requestId}] incoming`,
    JSON.stringify({
      model: selectedModel,
      mainEntityLen: analysis.mainEntity.trim().length,
      sceneStateLen: analysis.sceneState.trim().length,
      userEmotion: analysis.userEmotion.trim().slice(0, 12),
    })
  );

  /* 4. 构造消息 */
  const userContent = [
    "以下是用户当前场景的感知数据（JSON），请严格按照 System Prompt 格式输出纯 JSON，不要任何额外文字：",
    JSON.stringify({
      mainEntity: analysis.mainEntity,
      sceneState: analysis.sceneState,
      userEmotion: analysis.userEmotion,
      evidence: analysis.evidence ?? "",
      imageType: analysis.imageType ?? "other",
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

  async function callUpstream(payload: unknown): Promise<{
    rawContent: string;
    finishReason?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
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
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await upstreamRes.text().catch(() => upstreamRes.statusText);

      if (!upstreamRes.ok) {
        console.error(
          `[guess][${requestId}] upstream not ok`,
          upstreamRes.status,
          safeSnippet(rawText, 300)
        );
        const err = new Error(`UPSTREAM_NOT_OK:${upstreamRes.status}`);
        (err as { status?: number; detail?: string }).status = upstreamRes.status;
        (err as { status?: number; detail?: string }).detail = rawText;
        throw err;
      }

      const upstreamData = (rawText ? JSON.parse(rawText) : {}) as {
        choices?: Array<{
          message?: { content?: string; reasoning_content?: string };
          finish_reason?: string;
        }>;
        error?: { message: string };
      };

      if (upstreamData.error) {
        console.error(`[guess][${requestId}] upstream error:`, upstreamData.error);
        throw new Error(`UPSTREAM_ERROR:${upstreamData.error.message}`);
      }

      const choice = upstreamData.choices?.[0];
      const msg = choice?.message as
        | { content?: string; reasoning_content?: string }
        | undefined;
      const content = typeof msg?.content === "string" ? msg.content.trim() : "";
      const reasoning =
        typeof msg?.reasoning_content === "string" ? msg.reasoning_content.trim() : "";
      const rawContent = content || reasoning;
      if (!rawContent) {
        console.error(`[guess][${requestId}] empty content`);
        throw new Error("EMPTY_CONTENT");
      }

      return { rawContent, finishReason: choice?.finish_reason };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("TIMEOUT");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* 5. 调用上游 API */
  let rawContent: string;
  let finishReason: string | undefined;

  try {
    const r = await callUpstream(requestPayload);
    rawContent = r.rawContent;
    finishReason = r.finishReason;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      return errorResponse("TIMEOUT", `AI 决策超时，请稍后重试（请求号：${requestId}）`, 504);
    }
    const status = (err as { status?: number }).status;
    const detail = (err as { detail?: string }).detail;
    if (typeof status === "number") {
      return errorResponse(
        "UPSTREAM_ERROR",
        `大模型服务异常（${status}）：${safeSnippet(detail ?? String(err), 200)}（请求号：${requestId}）`,
        502
      );
    }
    console.error(`[guess][${requestId}] upstream exception:`, err);
    return errorResponse("UPSTREAM_ERROR", `连接大模型服务失败（请求号：${requestId}）`, 502);
  }

  /* 6. 解析与校验 JSON */
  let result: GuessResult;

  try {
    console.error(
      `[guess][${requestId}] rawContent`,
      safeSnippet(rawContent, 240),
      finishReason ? `(finish_reason:${finishReason})` : ""
    );
    const jsonStr = extractJSON(rawContent);
    console.error(`[guess][${requestId}] extractedJSON`, safeSnippet(jsonStr, 240));
    const parsed = JSON.parse(jsonStr) as Partial<GuessResult>;

    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      throw new Error("reply 字段缺失或为空");
    }
    if (!Array.isArray(parsed.options) || parsed.options.length < 3) {
      throw new Error(`options 至少需要 3 项，实际：${JSON.stringify(parsed.options)?.slice(0, 80)}`);
    }
    const normalized = (parsed.options as unknown[])
      .slice(0, 3)
      .map((o, idx) => normalizeOption(o, idx + 1))
      .filter((v): v is GuessOption => !!v);
    if (normalized.length !== 3) {
      throw new Error("options 中存在非法项（缺少 id/title/prompt）");
    }

    result = { reply: parsed.reply.trim(), options: normalized };
  } catch (err) {
    // 兼容：模型偶发截断/未闭合 JSON，自动重试一次（更高 max_tokens、更低随机性、更强约束）
    const msg = err instanceof Error ? err.message : String(err);
    const shouldRetry =
      err instanceof SyntaxError ||
      msg.includes("JSON") ||
      msg.includes("Expected") ||
      finishReason === "length";

    if (!shouldRetry) {
      console.error(`[guess][${requestId}] JSON 解析失败`, err);
      return errorResponse("PARSE_ERROR", `AI 返回格式异常，解析失败（请求号：${requestId}）`, 500);
    }

    console.error(`[guess][${requestId}] parse failed, retry once`, msg);
    try {
      const retryPayload = {
        ...requestPayload,
        max_tokens: 1200,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\n## 额外硬约束\n- 输出必须是完整可被 JSON.parse 成功解析的 JSON（所有引号与括号必须闭合）\n- 不要截断，不要省略字段\n- 除 JSON 外禁止输出任何字符`,
          },
          { role: "user", content: userContent },
        ],
      };
      const r2 = await callUpstream(retryPayload);
      rawContent = r2.rawContent;
      finishReason = r2.finishReason;

      console.error(
        `[guess][${requestId}] retry rawContent`,
        safeSnippet(rawContent, 240),
        finishReason ? `(finish_reason:${finishReason})` : ""
      );
      const jsonStr2 = extractJSON(rawContent);
      console.error(`[guess][${requestId}] retry extractedJSON`, safeSnippet(jsonStr2, 240));
      const parsed2 = JSON.parse(jsonStr2) as Partial<GuessResult>;

      if (typeof parsed2.reply !== "string" || !parsed2.reply.trim()) {
        throw new Error("reply 字段缺失或为空");
      }
      if (!Array.isArray(parsed2.options) || parsed2.options.length < 3) {
        throw new Error(`options 至少需要 3 项，实际：${JSON.stringify(parsed2.options)?.slice(0, 80)}`);
      }
      const normalized2 = (parsed2.options as unknown[])
        .slice(0, 3)
        .map((o, idx) => normalizeOption(o, idx + 1))
        .filter((v): v is GuessOption => !!v);
      if (normalized2.length !== 3) {
        throw new Error("options 中存在非法项（缺少 id/title/prompt）");
      }

      result = { reply: parsed2.reply.trim(), options: normalized2 };
    } catch (retryErr) {
      console.error(`[guess][${requestId}] retry failed`, retryErr);
      return errorResponse("PARSE_ERROR", `AI 返回格式异常，解析失败（请求号：${requestId}）`, 500);
    }
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
