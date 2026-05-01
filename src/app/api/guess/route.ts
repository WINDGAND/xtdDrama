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
 * 新增能力：
 *   - exclude + 规则去重：换一批时避免与历史批次重复
 *   - 语义兜底重写：规则去重后仍冲突时二次调用模型差异化
 *   - userHint：用户自定义偏好影响推荐
 *   - mode=direct：跳过三选一直接生成单条 option
 *
 * 模型配置：
 *   TOKENHUB_GUESS_MODEL（默认 hunyuan-2.0-instruct-20251111，见官方「文本生成」文档）
 */

import { NextRequest, NextResponse } from "next/server";
import { extractJSON } from "@/lib/extract-json";
import { randomUUID } from "crypto";
import type {
  GuessRequestBody,
  GuessResult,
  GuessOption,
  GuessOptionSignature,
  GuessSuccessResponse,
  GuessErrorResponse,
  GuessResponseMeta,
} from "@/types/guess";

/* ----------------------------------------------------------------
 * 环境变量
 * ---------------------------------------------------------------- */
const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL =
  process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
const TOKENHUB_GUESS_MODEL =
  process.env.TOKENHUB_GUESS_MODEL ?? "hunyuan-2.0-instruct-20251111";
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

/* ----------------------------------------------------------------
 * 三轴轴词缀（规则去重用）
 * ---------------------------------------------------------------- */
const AXIS_KEYWORDS = {
  illustration: ["clean illustration style", "editorial illustration", "comic panel style", "hand-drawn line art", "storybook illustration"],
  film: ["cinematic film photography", "warm film grain", "analog photography", "soft bokeh", "35mm film aesthetic"],
  design: ["graphic poster design", "flat design illustration", "editorial layout", "minimalist graphic", "bold clean composition"],
} as const;

/* ----------------------------------------------------------------
 * System Prompt 基础版
 * ---------------------------------------------------------------- */
const SYSTEM_PROMPT_BASE = `你是一位善于观察、有共情力的朋友视角分析师，代号「Drama 引擎」。你能准确读懂图里发生了什么，用轻巧、克制、有温度的方式点出来——不表演，不浮夸，像一个真的在认真看图的人。

## 核心任务
根据用户提供的场景感知 JSON（含 mainEntity / sceneState / userEmotion / evidence / imageType），输出**纯 JSON 字符串**，格式如下：
{"reply":"<一句话点评，中文，15-35字>","options":[{"id":1,"title":"<中文风格名称，3-6字>","description":"<中文说明，10-20字>","prompt":"<英文 SDXL 提示词，40-80词>"},{"id":2,"title":"<中文风格名称，3-6字>","description":"<中文说明，10-20字>","prompt":"<英文 SDXL 提示词，40-80词>"},{"id":3,"title":"<中文风格名称，3-6字>","description":"<中文说明，10-20字>","prompt":"<英文 SDXL 提示词，40-80词>"}]}

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

## description 创作原则（中文说明字段，面向用户展示）

每个 option 必须包含 description 字段，要求：
- **10-20 字中文**，语言具体，不写空泛的"高质量""独特"
- **融入主体元素**：从 mainEntity 或 sceneState 中提取 1-2 个具体词，体现"专属感"而非套话
- **说明视觉变化**：告诉用户这个风格会把画面"改造成什么"，而不是重复 title 的意思
- 三个 description 之间必须有明显差异，突出每条的独有特点
- 示例思路：「把[主体]变成清新绘本里的角色」「用胶片颗粒让[场景]多一点怀旧温度」「干净构图让[主体]有种展览海报感」

## SDXL prompt 结构化公式

每个 option 的 prompt 必须按以下顺序组装（40-80词）：
1. **主体不变锚定**（必填，每条 prompt 开头）：\`preserve original subject and composition, keep subject recognizable,\`
2. **轴专属美学词缀**（必填，对应上方三轴词缀中至少一个）
3. **场景氛围改写**（必填，根据 mainEntity + sceneState + imageType 描述戏剧化改写方向，1-2 句）
4. **质量词缀**（必填，结尾固定）：\`high quality, detailed, 4k\`

禁止词缀（不得出现）：neon glow, neon accents, cyberpunk aesthetic, dark atmospheric, horror elements, blood, violence, grotesque, eldritch, nsfw

## 反同质化约束（P1 升级）

三个 option 之间必须有实质差异，不能只换颜色词或情绪词：
- title 三者不得含相同的核心名词（如同时出现"胶片"或"漫画"）
- description 三者中不得出现同一动词（如都用"变成"或"让"开头）
- prompt 的主场景描述词汇不得超过 30% 重叠

## 禁止事项
- 禁止在 JSON 之外输出任何文字、解释或 markdown
- 禁止输出 \`\`\`json 代码块
- 禁止 options 少于或多于 3 个
- description 字段必须为中文，prompt 字段必须为英文
- **字段名必须严格**：options 每一项必须包含 id/title/description/prompt，不要使用"标题/提示词/说明"等别名`;

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
  const descriptionRaw = obj.description ?? obj["说明"] ?? obj.desc ?? obj["中文说明"] ?? "";

  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : undefined;
  if (!Number.isFinite(id) || !title || !prompt) return null;
  return { id, title, ...(description ? { description } : {}), prompt };
}

function safeSnippet(input: string, maxLen: number) {
  const s = String(input ?? "");
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/* ----------------------------------------------------------------
 * 规则去重
 * ---------------------------------------------------------------- */

/** 提取 prompt 里命中了哪个轴 */
function detectAxis(prompt: string): "illustration" | "film" | "design" | null {
  const p = prompt.toLowerCase();
  if (AXIS_KEYWORDS.illustration.some((k) => p.includes(k))) return "illustration";
  if (AXIS_KEYWORDS.film.some((k) => p.includes(k))) return "film";
  if (AXIS_KEYWORDS.design.some((k) => p.includes(k))) return "design";
  return null;
}

/** 提取 title/description 的关键词集合（去停用词后取首2词） */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set(["风", "感", "的", "和", "把", "变成", "让", "有种", "多一点", "一点"]);
  return new Set(
    text
      .split(/[\s，。、：:,.!！?？]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !stopWords.has(w))
      .slice(0, 4)
  );
}

/**
 * 规则去重：检查新批次候选是否与历史候选在「轴 + 关键词」上重复。
 * 返回冲突数（0 = 完全无冲突）。
 */
function ruleConflictCount(candidates: GuessOption[], exclude: GuessOptionSignature[]): number {
  if (!exclude.length) return 0;

  const excludeAxes = new Set(exclude.map((e) => detectAxis(e.prompt)).filter(Boolean));
  const excludeTitles = new Set(exclude.map((e) => e.title.trim()));
  const excludeKeywordSets = exclude.map((e) =>
    extractKeywords((e.description ?? "") + " " + e.title)
  );

  let conflicts = 0;
  for (const c of candidates) {
    const axis = detectAxis(c.prompt);
    if (axis && excludeAxes.has(axis)) {
      conflicts++;
      continue;
    }
    if (excludeTitles.has(c.title.trim())) {
      conflicts++;
      continue;
    }
    const cKw = extractKeywords((c.description ?? "") + " " + c.title);
    for (const exKw of excludeKeywordSets) {
      const shared = [...cKw].filter((k) => exKw.has(k));
      if (shared.length >= 2) {
        conflicts++;
        break;
      }
    }
  }
  return conflicts;
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

  const {
    analysis,
    model,
    exclude = [],
    batchIndex = 1,
    userHint,
    mode = "recommend",
  } = body;

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

  // userHint 长度校验
  const cleanHint = userHint?.trim() ?? "";
  if (cleanHint.length > 0 && (cleanHint.length < 2 || cleanHint.length > 60)) {
    return errorResponse("INVALID_INPUT", "userHint 长度应在 2-60 字之间");
  }

  /* 3. 选定模型 */
  const selectedModel = model?.trim() || TOKENHUB_GUESS_MODEL;
  console.error(
    `[guess][${requestId}] incoming`,
    JSON.stringify({
      model: selectedModel,
      batchIndex,
      mode,
      hasUserHint: !!cleanHint,
      excludeCount: exclude.length,
      mainEntityLen: analysis.mainEntity.trim().length,
      userEmotion: analysis.userEmotion.trim().slice(0, 12),
    })
  );

  /* 4. 构造 system prompt（根据批次和 userHint 动态追加约束） */
  let systemPrompt = SYSTEM_PROMPT_BASE;

  // 换一批：追加已排除标题与差异化要求
  if (exclude.length > 0) {
    const excludedTitles = exclude.map((e) => `「${e.title}」`).join("、");
    systemPrompt += `\n\n## 换一批约束（第 ${batchIndex} 批）
- 本次**禁止**生成以下已出现过的风格：${excludedTitles}
- title、description 与上述已有风格不得雷同
- 每条 prompt 的轴词缀必须与已有风格的轴词缀不同（插画/胶片/设计各轴全部重新选词）
- 三条新方向必须在视觉感觉上与已有风格有明显差异`;
  }

  // userHint 影响推荐
  if (cleanHint) {
    systemPrompt += `\n\n## 用户偏好（优先融入）
用户补充了一句偏好描述："${cleanHint}"
- 在不违反三轴规则的前提下，三个 option 的 title/description/prompt 都应尽量融入或呼应这一偏好
- 不允许直接照搬用户原话，应转化为视觉语言`;
  }

  // direct 模式：只生成 1 条最匹配选项
  if (mode === "direct") {
    systemPrompt += `\n\n## Direct 模式约束
- 本次只需返回**1 个** option（id=1），是最契合用户偏好"${cleanHint}"的风格
- options 数组只有 1 项，reply 保持正常输出
- 禁止返回 2 或 3 个 option`;
  }

  /* 5. 构造用户消息 */
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
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: mode === "direct" ? 500 : 800,
    temperature: 0.85,
    stream: false,
  };

  /* ---- callUpstream helper ---- */
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
        console.error(`[guess][${requestId}] upstream not ok`, upstreamRes.status, safeSnippet(rawText, 300));
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
      const msg = choice?.message as { content?: string; reasoning_content?: string } | undefined;
      const content = typeof msg?.content === "string" ? msg.content.trim() : "";
      const reasoning = typeof msg?.reasoning_content === "string" ? msg.reasoning_content.trim() : "";
      const rawContent = content || reasoning;
      if (!rawContent) {
        console.error(`[guess][${requestId}] empty content`);
        throw new Error("EMPTY_CONTENT");
      }
      return { rawContent, finishReason: choice?.finish_reason };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("TIMEOUT");
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ---- parseOptions helper ---- */
  function parseOptions(raw: string, allowSingle: boolean): { reply: string; options: GuessOption[] } {
    const jsonStr = extractJSON(raw);
    const parsed = JSON.parse(jsonStr) as Partial<GuessResult>;
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      throw new Error("reply 字段缺失或为空");
    }
    const minOptions = allowSingle ? 1 : 3;
    if (!Array.isArray(parsed.options) || parsed.options.length < minOptions) {
      throw new Error(`options 至少需要 ${minOptions} 项，实际：${JSON.stringify(parsed.options)?.slice(0, 80)}`);
    }
    const normalized = (parsed.options as unknown[])
      .slice(0, allowSingle ? 1 : 3)
      .map((o, idx) => normalizeOption(o, idx + 1))
      .filter((v): v is GuessOption => !!v);
    if (normalized.length < minOptions) {
      throw new Error("options 中存在非法项（缺少 id/title/prompt）");
    }
    return { reply: parsed.reply.trim(), options: normalized };
  }

  /* 6. 调用上游 API */
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
      return errorResponse("UPSTREAM_ERROR", `大模型服务异常（${status}）：${safeSnippet(detail ?? String(err), 200)}（请求号：${requestId}）`, 502);
    }
    console.error(`[guess][${requestId}] upstream exception:`, err);
    return errorResponse("UPSTREAM_ERROR", `连接大模型服务失败（请求号：${requestId}）`, 502);
  }

  /* 7. 解析与校验 JSON */
  let result: GuessResult;
  let dedupLevel: GuessResponseMeta["dedupLevel"] = "none";

  const isDirect = mode === "direct";

  try {
    console.error(`[guess][${requestId}] rawContent`, safeSnippet(rawContent, 240), finishReason ? `(finish_reason:${finishReason})` : "");
    const parsed = parseOptions(rawContent, isDirect);
    result = parsed;
  } catch (err) {
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
            content: `${systemPrompt}\n\n## 额外硬约束\n- 输出必须是完整可被 JSON.parse 成功解析的 JSON（所有引号与括号必须闭合）\n- 不要截断，不要省略字段\n- 除 JSON 外禁止输出任何字符`,
          },
          { role: "user", content: userContent },
        ],
      };
      const r2 = await callUpstream(retryPayload);
      rawContent = r2.rawContent;
      finishReason = r2.finishReason;
      console.error(`[guess][${requestId}] retry rawContent`, safeSnippet(rawContent, 240));
      result = parseOptions(rawContent, isDirect);
    } catch (retryErr) {
      console.error(`[guess][${requestId}] retry failed`, retryErr);
      return errorResponse("PARSE_ERROR", `AI 返回格式异常，解析失败（请求号：${requestId}）`, 500);
    }
  }

  /* 8. 规则去重检查（仅 recommend 模式 + 有 exclude）*/
  if (!isDirect && exclude.length > 0) {
    const conflicts = ruleConflictCount(result.options, exclude);
    console.error(`[guess][${requestId}] rule dedup conflicts=${conflicts}`);

    if (conflicts > 0) {
      dedupLevel = "rule";
      // 语义兜底：重新调用模型，要求差异化重写
      try {
        const semanticSystemPrompt = `${systemPrompt}

## 语义差异化强约束（当前批次去重兜底）
检测到本批候选与历史批次存在 ${conflicts} 个雷同项，必须重新生成。
- 每个 option 的核心美学方向必须与历史批次完全不同
- title 不得使用历史批次已有的任何词汇
- description 必须描述全新的视觉感受
- prompt 的轴词缀必须选择与历史批次不同的词汇`;

        const semanticPayload = {
          model: selectedModel,
          messages: [
            { role: "system", content: semanticSystemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 900,
          temperature: 0.9,
          stream: false,
        };

        const r3 = await callUpstream(semanticPayload);
        const semanticResult = parseOptions(r3.rawContent, false);
        const afterConflicts = ruleConflictCount(semanticResult.options, exclude);
        console.error(`[guess][${requestId}] semantic rewrite conflicts after=${afterConflicts}`);

        if (afterConflicts < conflicts) {
          result = semanticResult;
          dedupLevel = "semantic";
        } else {
          // 兜底：用第一次结果（不阻断链路）
          dedupLevel = "fallback";
        }
      } catch (semanticErr) {
        console.error(`[guess][${requestId}] semantic rewrite failed, fallback`, semanticErr);
        dedupLevel = "fallback";
      }
    }
  }

  /* 9. 返回结果 */
  const meta: GuessResponseMeta = {
    batchIndex,
    dedupLevel,
    hasUserHint: !!cleanHint,
  };

  const response: GuessSuccessResponse = {
    success: true,
    data: result,
    meta,
    ...(process.env.NODE_ENV === "development" && { rawContent }),
  };

  return NextResponse.json<GuessSuccessResponse>(response, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
