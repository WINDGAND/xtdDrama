/**
 * /api/guess — AI 决策引擎「吐槽 + Drama 方向三选」接口
 *
 * 职责（对应 PRD「Guess & Refine 层」）：
 *   1. 接收 Vision 感知结构（mainEntity / sceneState / userEmotion）
 *   2. 调用 TokenHub 混元文本模型（chat/completions）
 *   3. 返回结构化 JSON：
 *      - reply   : 一句共情/俏皮/旁白式点评（击中情绪，克制自然）
 *      - options : 3 个针对当前图片的轻度 Drama 改造方向，每项含中文叙事体生图指令
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
 * System Prompt 基础版
 * ---------------------------------------------------------------- */
const SYSTEM_PROMPT_BASE = `你是一位善于挖掘日常戏剧性的视觉创意人，代号「Drama 导演」。你能精准读懂一张图片的物理骨架与情绪底色，然后为它设计「轻度 Drama 改造」方案——在绝对还原现实感的基础上，加入一个能让人会心一笑、又不破坏可信度的视觉惊喜。

## 核心任务
根据用户提供的场景感知 JSON（含 mainEntity / sceneState / userEmotion / evidence / imageType），输出**纯 JSON 字符串**，格式如下：
{"reply":"<一句话点评，中文，15-35字>","options":[{"id":1,"title":"<中文方向名，3-6字>","description":"<中文说明，10-20字>","prompt":"<中文叙事体生图指令，100-200字>"},{"id":2,"title":"<中文方向名，3-6字>","description":"<中文说明，10-20字>","prompt":"<中文叙事体生图指令，100-200字>"},{"id":3,"title":"<中文方向名，3-6字>","description":"<中文说明，10-20字>","prompt":"<中文叙事体生图指令，100-200字>"}]}

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

## options：三个轻度 Drama 改造方向

每次必须根据**这张图片的具体特征**，自由提炼 3 个各不相同的改造方向，禁止套用固定模板或风格滤镜。

### 如何找到改造点
在 mainEntity、sceneState 中扫描具备「反差潜力」的自然元素，例如：
- 蒸汽、烟雾、光晕、水雾等能量态 → 可具现化为半透明的「存在体」
- 光斑、倒影、阴影、纹理 → 可异化为另一种材质或媒介的等效形态
- 视觉上的"重复结构"（一排车灯、一堆书、密集文字）→ 可通过尺度错位或叙事重构产生幽默感

### 三条铁律（每个 option 都必须严格遵守）

**铁律一：绝对的物理锚定**
- 每条 prompt 必须以「（请严格锁定原图的[列出关键物理元素]，物理骨架、现实环境和光线角度完全不变。）」开头
- 禁止改变原图中任何实体物体的身份（不能把杯子变成花盆，不能把汽车变成马车）
- 原图的现实感——无论破败/平庸/混乱——都必须 100% 保留，这是共鸣的基石

**铁律二：轻度的逻辑错位**
- 通过以下方式之一制造幽默感（选择最适合这张图的那种）：
  - 尺度错位：微小物体具备宏大气场，或庞大困境被矮化为渺小意象
  - 材质异化：某个视觉元素原位变成另一种介质的等效形态（光变成音频可视化、蒸汽变成半透明人形）
  - 精灵具现：能量/热气/光以一种半透明「存在体」形式呈现，带有克制的超现实感
- 改造幅度必须「轻度」：绝不是末日级、宇宙级、奇迹级别的变化；应该是「让人看了觉得有趣、会心一笑」而不是「让人觉得这是 AI 合成」

**铁律三：虚实交融的克制感**
- 附加的 Drama 元素绝对不能喧宾夺主：它应该像一个「藏在真实里的小惊喜」
- prompt 描述中必须包含克制感修饰：如「半透明」「极其克制」「隐约」「若隐若现」「恰到好处地融入」
- Drama 元素应与原图光线和材质自然融合，不能产生明显的 PS 感或 AI 感

### option 格式规范

**title（3-6 字中文）**：直接描述这个方向的 Drama 核心是什么，语言具体，禁止用「×× 感」「×× 风」等空泛后缀

**description（10-20 字中文）**：
- 融入 mainEntity 中 1-2 个元素词
- 说明「哪个元素」以「什么方式」发生了「多轻度」的变化
- 禁止写「高质量」「独特风格」等空话

**prompt（中文叙事体，100-200 字）**：按以下顺序组装：
1. 锚定指令（必填）：（请严格锁定原图的[关键物理元素清单]，物理骨架和现实环境完全不变。）
2. 场景还原（必填）：用 1-2 句还原原图整体氛围和现实基调，体现真实感
3. Drama 改造（必填）：描述选定元素发生了什么变化，形态如何，有多克制，如何融入真实场景
4. 质感收尾（必填）：整体保留纪实感，特效极其克制，完美融入真实场景，没有破坏现实感。

### few-shot 参考示例（只用于理解方向，禁止直接照搬元素）

**示例一（泡面场景）**
- 感知：mainEntity=泡面桶和叉子，sceneState=深夜宿舍昏暗书桌，userEmotion=疲惫
- 改造方向：蒸汽中具现出大厨灵体
- prompt 示例：（请严格锁定原图的宿舍书桌、泡面桶、叉子、书本布局和光线角度，物理骨架和现实环境完全不变。）深夜宿舍书桌，台灯暖黄色光线集中在泡面桶上，周围昏暗，真实还原月底穷学生的平庸生活切片。那股从泡面中升腾而起的白色热气，在半空中幻化成了一个极其精致、散发着淡淡神圣金色微光、呈半透明灵体状态的法国米其林三星大厨——他戴着高高的厨师帽，用优雅又夸张的法式姿态，小心翼翼地往那撮廉价面条上撒着发着微光的"魔法胡椒粉"。整体保留纪实感，特效极其克制，没有破坏原本宿舍的写实基调，蒸汽大厨完美融入原有的光线中，若隐若现。

**示例二（堵车场景）**
- 感知：mainEntity=挡风玻璃和前方车灯，sceneState=雨夜堵车，userEmotion=烦躁
- 改造方向：车灯群异化为赛博 EQ 柱
- prompt 示例：（请严格保留挡风玻璃上的雨滴水雾、雨天阴郁的整体氛围和道路的物理透视结构，物理骨架完全不变。）透过布满密集雨滴的挡风玻璃，前方严重堵车，天空暗蓝，雨刷器刚刮过的水痕清晰可见，真实还原通勤焦虑。前方那片原本杂乱刺眼的红色刹车尾灯群，竟然发生了一种奇妙的秩序化光影变化：它们向上延伸，变成了一组极其巨大、散发着霓虹红色和电光紫色光芒的半透明赛博音轨均衡器（EQ Bars），仿佛跟随着无形的节拍在雨中上下跳动。整体保留写实纪实基调，特效极其克制，完美融入雨天的光斑晕染中，现实的车流依然可见。

### 三方向差异约束
三个 option 之间必须有实质差异，禁止套用同类手法：
- title 三者核心名词不得相同
- 改造的「目标元素」不得相同（不能三个都改光线，或三个都改纹理）
- prompt 的 Drama 改造手法不得相同（不能都是「具现化人形」或都是「材质异化」）

## 绝对禁止事项
- 禁止在 JSON 之外输出任何文字、解释或 markdown
- 禁止输出 \`\`\`json 代码块
- 禁止 options 少于或多于 3 个（direct 模式除外）
- 禁止在任何 prompt 中出现：宇宙级、史诗级、神迹、天启、毁灭、末日、奇迹般、克苏鲁、哥特、血腥、暴力、nsfw
- prompt 字段必须为中文叙事体（禁止使用英文 SDXL keyword 风格）
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
 * 规则去重（基于 title + description 关键词，无固定轴检测）
 * ---------------------------------------------------------------- */

/** 提取 title/description 的关键词集合（去停用词后取首 4 词） */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set(["风", "感", "的", "和", "把", "变成", "让", "有种", "多一点", "一点", "一个", "成了", "化为"]);
  return new Set(
    text
      .split(/[\s，。、：:,.!！?？（）()]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !stopWords.has(w))
      .slice(0, 4)
  );
}

/**
 * 规则去重：检查新批次候选是否与历史候选在「title + 关键词」上重复。
 * 返回冲突数（0 = 完全无冲突）。
 */
function ruleConflictCount(candidates: GuessOption[], exclude: GuessOptionSignature[]): number {
  if (!exclude.length) return 0;

  const excludeTitles = new Set(exclude.map((e) => e.title.trim()));
  const excludeKeywordSets = exclude.map((e) =>
    extractKeywords((e.description ?? "") + " " + e.title)
  );

  let conflicts = 0;
  for (const c of candidates) {
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

  // 换一批：追加已排除方向与差异化要求
  if (exclude.length > 0) {
    const excludedTitles = exclude.map((e) => `「${e.title}」`).join("、");
    systemPrompt += `\n\n## 换一批约束（第 ${batchIndex} 批）
- 本次**禁止**生成以下已出现过的方向：${excludedTitles}
- title、description 与上述已有方向不得雷同
- 三条新方向的「改造目标元素」必须与已有方向的改造目标完全不同
- 三条新方向的 Drama 手法（具现化/尺度错位/材质异化等）至少有 2 条与已有方向不同`;
  }

  // userHint 影响推荐
  if (cleanHint) {
    systemPrompt += `\n\n## 用户偏好（优先融入）
用户补充了一句偏好描述："${cleanHint}"
- 在不违反三条铁律的前提下，三个 option 的方向选择应尽量贴近或呼应这一偏好
- 不允许直接照搬用户原话，应转化为具体的视觉改造思路`;
  }

  // direct 模式：只生成 1 条最匹配选项
  if (mode === "direct") {
    systemPrompt += `\n\n## Direct 模式约束
- 本次只需返回**1 个** option（id=1），是最契合用户偏好"${cleanHint}"的 Drama 改造方向
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
    max_tokens: mode === "direct" ? 800 : 1400,
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
        max_tokens: 1800,
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
- 每个 option 的 Drama 改造方向和目标元素必须与历史批次完全不同
- title 不得使用历史批次已有的任何核心词汇
- description 必须描述全新的 Drama 改造思路
- prompt 的改造手法（具现化/尺度错位/材质异化）不得与历史批次已有的手法重复`;

        const semanticPayload = {
          model: selectedModel,
          messages: [
            { role: "system", content: semanticSystemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 1600,
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
