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
import { tokenHubChatCompletionsUrl, tokenHubMaasChatCompletionsUrl } from "@/lib/tokenhub";
import { randomUUID } from "crypto";

/* ----------------------------------------------------------------
 * Vision 路由使用「通用 Token Plan（MaaS）」凭证，因为 youtu-vita
 * 只在旧端点（tokenhub.tencentmaas.com）上可用，与 Hy Plan 文本端点分离。
 * ---------------------------------------------------------------- */
import type {
  VisionRequestBody,
  VisionAnalysis,
  VisionSuccessResponse,
  VisionErrorResponse,
} from "@/types/vision";

/* ----------------------------------------------------------------
 * 环境变量
 * 视觉模型使用 MaaS 凭证；文本兜底仍使用 Hy Plan 主凭证。
 * ---------------------------------------------------------------- */
const TOKENHUB_MAAS_API_KEY =
  process.env.TOKENHUB_MAAS_API_KEY || process.env.TOKENHUB_API_KEY || "";
const TOKENHUB_TEXT_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
/** youtu-vita — TokenHub 上唯一经验证支持图片输入的多模态模型 */
const TOKENHUB_VITA_MODEL =
  process.env.TOKENHUB_VITA_MODEL ?? "youtu-vita";
const TOKENHUB_MAX_TOKENS = Number(process.env.TOKENHUB_MAX_TOKENS ?? "900");
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");
const TOKENHUB_EMOTION_MODEL =
  process.env.TOKENHUB_EMOTION_MODEL ?? process.env.TOKENHUB_GUESS_MODEL ?? "hy3-preview";

const EMOTION_ENUM = [
  "崩溃",
  "烦躁",
  "尴尬",
  "无奈",
  "焦虑",
  "疲惫",
  "委屈",
  "开心",
  "兴奋",
  "无聊",
  "平静",
  "好奇",
  "迷茫",
] as const;

const MAX_MAIN_ENTITY_LEN = 60;
const MAX_SCENE_STATE_LEN = 100;
const DEFAULT_STYLE_HINTS = ["网络化夸张", "反差戏剧感", "梗图化表达"];
const FALLBACK_MAIN_ENTITY = "未知场景";
const FALLBACK_SCENE_STATE = "图像信息不足";

const IMAGE_TYPE_ENUM = ["portrait", "object", "food", "scene", "pet", "other"] as const;
type ImageType = typeof IMAGE_TYPE_ENUM[number];

function normalizeImageType(raw: unknown): ImageType {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return IMAGE_TYPE_ENUM.includes(s as ImageType) ? (s as ImageType) : "other";
}

/* ----------------------------------------------------------------
 * System Prompt — 「敏锐的场景观察者」v2
 *
 * 设计原则：
 *   1. 角色锁定：禁止模型输出任何非 JSON 内容
 *   2. 字段约束：强制输出 imageType / mainEntity / sceneState /
 *               userEmotion / evidence / emotionCandidates / styleHints
 *   3. imageType 感知：按类型差异化 styleHints 建议方向
 *   4. evidence 收紧：只写可见视觉线索，格式化
 *   5. 兜底：图片无法识别时输出预设 fallback JSON
 * ---------------------------------------------------------------- */
const SYSTEM_PROMPT = `你是一位冷静客观的场景分析 AI，代号「观察者」。你具备真实的图像视觉理解能力，能直接"看懂"用户上传的图片。

## 核心任务
分析用户上传的图片，输出一段**纯 JSON 字符串**，客观描述图片类型、场景状态与情绪氛围。

## 重要说明
你分析的是图片本身传递的情绪氛围，而非主观猜测拍照者的心情。情绪判断必须有画面线索支撑，不得凭空推断。

## 输出格式（严格遵守，禁止任何额外文字）
{"imageType":"<portrait|object|food|scene|pet|other>","mainEntity":"<核心主体完整描述，10-25字，例：深夜书桌上热气腾腾的一桶泡面>","sceneState":"<物理环境与氛围，15-40字，必须与mainEntity内容不同，例：昏暗宿舍，台灯暖黄，书本凌乱，深夜寂静>","userEmotion":"<情绪标签，必须从枚举里选 1 个>","evidence":"<画面可见视觉线索，格式[视觉元素]+[状态]，≤20字，例如：桌面一片狼藉>","emotionCandidates":[{"label":"<枚举情绪>","score":0.0},{"label":"<枚举情绪>","score":0.0},{"label":"<枚举情绪>","score":0.0}],"styleHints":["<改写方向1>","<改写方向2>","<改写方向3>"]}

## 字段详细说明

### mainEntity（核心主体）
- **长度：10-25 字**中文完整短句
- 必须具体描述你看到的核心被摄物，包含：数量特征 + 状态特征 + 物体名称
- 好的示例：「深夜书桌上热气腾腾的一桶泡面」「地铁站台边密密麻麻的等车人群」「打翻在桌面上正在蔓延的咖啡」
- 差的示例（禁止）：「书桌」「泡面」「夜晚的书桌」——这类描述太短、太笼统，必须更具体

### sceneState（场景状态）
- **长度：15-40 字**，包含以下要素（能观察到几个写几个）：空间类型 + 光线特征 + 时间感 + 氛围细节
- 好的示例：「昏暗宿舍，台灯暖黄光打在桌面，窗外漆黑，深夜时分，周围寂静」「雨天傍晚的堵车路段，挡风玻璃布满雨滴，车灯在湿路面反光」
- **必须与 mainEntity 完全不同**：mainEntity 描述"是什么"，sceneState 描述"在哪里/什么环境"
- 不含主观情绪词，不重复 mainEntity 的内容

### userEmotion
图片整体传递的情绪氛围，从以下枚举里选 1 个最贴切的：${EMOTION_ENUM.join("、")}

### evidence
引用支撑情绪判断的具体画面视觉元素，格式"[视觉元素]+[状态]"，例如"桌面一片狼藉"、"表情紧绷眉头皱"，禁止写物体清单或主观臆断

### emotionCandidates
3 个候选情绪 + 置信度（0-1），按 score 从高到低排列

### styleHints
3 个克制幽默、真实可分享的视觉改写方向，必须保留主体可辨认，禁止极端元素（克苏鲁/赛博朋克/末日/霓虹/恐怖/血腥）；根据 imageType 选择方向：portrait 偏漫画脸谱/画报人物，object 偏插画道具/绘本物品，food 偏美食插画/杂志感，scene 偏胶片/手账速写，pet 偏Q版/儿童绘本，other 偏漫画分镜/复古胶片

## 禁止事项
- 禁止在 JSON 之外输出任何文字或解释
- 禁止输出 Markdown 代码块（不要写 \`\`\`json）
- 禁止使用英文（所有值必须为中文，imageType 枚举值除外）
- **mainEntity 和 sceneState 禁止填写相同内容**；mainEntity 字数不得少于 8 字；sceneState 字数不得少于 12 字
- 若图片无法识别，输出：{"imageType":"other","mainEntity":"画面内容难以辨认的模糊图像","sceneState":"图像过暗或过模糊，无法判断具体场景与光线","userEmotion":"迷茫","evidence":"图像信息不足","emotionCandidates":[{"label":"迷茫","score":0.7},{"label":"好奇","score":0.2},{"label":"平静","score":0.1}],"styleHints":["漫画插画感","清新日系感","温柔胶片感"]}`;
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

function safeSnippet(input: string, maxLen: number) {
  const s = String(input ?? "");
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

function normalizeText(input: unknown): string {
  return typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
}

function smartTrim(input: string, maxLen: number): string {
  const s = normalizeText(input);
  if (!s) return "";
  if (s.length <= maxLen) return s;
  const probe = s.slice(0, maxLen + 1);
  const marks = ["。", "，", "；", "、", ",", ";", " "];
  let cut = -1;
  for (const mark of marks) {
    const idx = probe.lastIndexOf(mark);
    if (idx > cut) cut = idx;
  }
  if (cut >= Math.floor(maxLen * 0.55)) {
    return probe.slice(0, cut).trim();
  }
  return `${probe.slice(0, maxLen).trim()}…`;
}

function pickEmotionFromKeywords(text: string): string | null {
  const t = text;
  if (!t) return null;
  if (/(打翻|洒|溢出|泼|一地|水渍|弄脏|碎|裂|漏)/.test(t)) return "烦躁";
  if (/(社死|尴尬|丢脸|当众)/.test(t)) return "尴尬";
  if (/(迟到|赶|来不及|地铁|拥挤|排队)/.test(t)) return "焦虑";
  if (/(无聊|发呆|没意思|空空|躺平)/.test(t)) return "无聊";
  if (/(累|疲惫|困|熬夜)/.test(t)) return "疲惫";
  if (/(崩溃|破防|绷不住|炸了)/.test(t)) return "崩溃";
  if (/(无奈|算了|认了|就这样)/.test(t)) return "无奈";
  if (/(开心|快乐|好耶|耶|幸福)/.test(t)) return "开心";
  return null;
}

function toComparableText(input: string): string {
  return normalizeText(input).replace(/[，。；、,\s]/g, "");
}

function isNearDuplicateText(a: string, b: string): boolean {
  const x = toComparableText(a);
  const y = toComparableText(b);
  if (!x || !y) return false;
  // 只在完全相同时判定为重复，不做包含检测（避免误过滤补充了更多环境信息的场景描述）
  return x === y;
}

function pickDistinctSceneState(mainEntity: string, candidates: string[]): string {
  const normalized = candidates.map((s) => normalizeText(s)).filter(Boolean);
  if (!normalized.length) return "场景待分析";
  // 优先取与 mainEntity 不完全重复的候选，若全部重复则直接取第一条（总比兜底占位更有意义）
  const distinct = normalized.filter((s) => !isNearDuplicateText(s, mainEntity));
  const best = distinct.length ? distinct : normalized;
  return smartTrim(best.slice(0, 2).join("；"), MAX_SCENE_STATE_LEN);
}

function normalizeEmotionToEnum(input: {
  userEmotion?: string;
  mainEntity: string;
  sceneState: string;
  evidence?: string;
}): string {
  const raw = normalizeText(input.userEmotion);
  if (raw && EMOTION_ENUM.includes(raw as (typeof EMOTION_ENUM)[number])) return raw;
  const fromKeywords = pickEmotionFromKeywords(
    [input.mainEntity, input.sceneState, input.evidence ?? ""].filter(Boolean).join("；")
  );
  return fromKeywords ?? "好奇";
}

function enforceVisionBoundaries(analysis: VisionAnalysis): VisionAnalysis {
  const mainEntity = smartTrim(normalizeText(analysis.mainEntity), MAX_MAIN_ENTITY_LEN);
  const sceneRaw = normalizeText(analysis.sceneState);
  const sceneCandidates = sceneRaw
    ? sceneRaw.split(/[；。]/).map((s) => normalizeText(s)).filter(Boolean)
    : [];
  let sceneState = pickDistinctSceneState(mainEntity, sceneCandidates.length ? sceneCandidates : [sceneRaw]);

  // 仅当 sceneState 与 mainEntity 完全相同（模型照搬）时才清空，让后续文本补全接手
  // 不因字数短而清空——短但独立的场景描述也有意义
  if (sceneState && toComparableText(sceneState) === toComparableText(mainEntity)) {
    sceneState = "";
  }

  const evidence = typeof analysis.evidence === "string" ? normalizeText(analysis.evidence) : undefined;
  const userEmotion = normalizeEmotionToEnum({
    userEmotion: analysis.userEmotion,
    mainEntity,
    sceneState,
    evidence,
  });

  return {
    ...analysis,
    mainEntity,
    sceneState,
    userEmotion,
    evidence,
  };
}

function isUsableAnalysis(analysis: VisionAnalysis): boolean {
  const mainEntity = normalizeText(analysis.mainEntity);
  // 必须是有意义的中文描述，至少 4 字
  if (!mainEntity || mainEntity.length < 4) return false;
  if (mainEntity === FALLBACK_MAIN_ENTITY) return false;
  // 拒绝纯英文/数字短词（youtu-vita 偶发将 "indoor"/"outdoor"/"studio" 等作为 mainEntity）
  if (/^[a-zA-Z0-9\s_\-,.'"]{1,20}$/.test(mainEntity)) return false;
  // sceneState 只检查明确的「无效兜底值」，不要求非空
  const sceneState = normalizeText(analysis.sceneState ?? "");
  if (sceneState === FALLBACK_SCENE_STATE) return false;
  return true;
}

function mapAnalysisFromDescription(input: {
  description: string;
  imageType?: unknown;
  styleHints?: unknown;
  evidence?: unknown;
}): VisionAnalysis {
  const desc = normalizeText(input.description);
  const kw = pickEmotionFromKeywords(desc) ?? "好奇";
  return {
    imageType: normalizeImageType(input.imageType),
    mainEntity: smartTrim(desc, MAX_MAIN_ENTITY_LEN),
    sceneState: smartTrim(desc, MAX_SCENE_STATE_LEN),
    userEmotion: kw,
    styleHints: Array.isArray(input.styleHints)
      ? input.styleHints.map(String).slice(0, 3)
      : DEFAULT_STYLE_HINTS,
    evidence: typeof input.evidence === "string" ? input.evidence.trim() : undefined,
  };
}

function mapAnalysisFromElements(input: {
  elements?: unknown;
  imageType?: unknown;
  styleHints?: unknown;
}): VisionAnalysis | null {
  if (!Array.isArray(input.elements)) return null;
  const lines = input.elements
    .map((item) => {
      if (typeof item === "string") return normalizeText(item);
      if (typeof item !== "object" || item === null) return "";
      const obj = item as Record<string, unknown>;
      const raw =
        obj.description ??
        obj.detail ??
        obj.caption ??
        obj.text ??
        obj.name;
      return normalizeText(raw);
    })
    .filter(Boolean);

  if (!lines.length) return null;

  const uniqueLines = Array.from(new Set(lines)).slice(0, 6);
  const mainEntity = smartTrim(uniqueLines[0], MAX_MAIN_ENTITY_LEN);
  const sceneState = pickDistinctSceneState(mainEntity, uniqueLines.slice(1, 4));
  const evidence = smartTrim(
    uniqueLines.find((s) => !isNearDuplicateText(s, mainEntity)) ?? uniqueLines[0],
    20
  );
  const emotionSource = uniqueLines.join("；");
  const userEmotion = pickEmotionFromKeywords(emotionSource) ?? "好奇";

  return {
    imageType: normalizeImageType(input.imageType),
    mainEntity,
    sceneState,
    userEmotion,
    evidence: evidence || undefined,
    styleHints: Array.isArray(input.styleHints)
      ? input.styleHints.map(String).slice(0, 3)
      : DEFAULT_STYLE_HINTS,
  };
}

/* ----------------------------------------------------------------
 * extractAllText — 递归提取任意 JSON 结构中的所有字符串值
 * 供 reanalyzeFromRawText 使用：不管 youtu-vita 返回什么格式，
 * 都能把可读文字内容拼合成一段纯文本，交给 HY-3 Preview 做结构化重组。
 * ---------------------------------------------------------------- */
function extractAllText(obj: unknown, depth = 0): string[] {
  if (depth > 6) return [];
  if (typeof obj === "string") {
    const s = obj.trim();
    return s.length > 1 ? [s] : [];
  }
  if (Array.isArray(obj)) return obj.flatMap((v) => extractAllText(v, depth + 1));
  if (obj !== null && typeof obj === "object") {
    return Object.values(obj as Record<string, unknown>).flatMap((v) =>
      extractAllText(v, depth + 1)
    );
  }
  return [];
}

/* ----------------------------------------------------------------
 * reanalyzeFromRawText — 两阶段解耦的第二阶段
 *
 * 当 youtu-vita 返回的 JSON 格式无法被任何已知路径解析时（parsePath = "fallback"），
 * 将其原始输出中的全部文字递归提取，拼成纯文字描述，
 * 再交给 HY-3 Preview 文本模型按严格 JSON schema 重新生成感知结构。
 *
 * 优势：
 *  - HY-3 Preview 是纯文本模型，对 System Prompt 的遵从率较高
 *  - 不管 youtu-vita 偶发输出 characters / setting / objects / 自由描述等任何格式，
 *    只要文字内容足够，HY-3 Preview 都能可靠产出 mainEntity / sceneState / userEmotion
 *  - 仅在 fallback 时触发，不影响正常路径的响应速度
 * ---------------------------------------------------------------- */
const REANALYZE_SYSTEM_PROMPT = `你是图像场景分析 JSON 生成器。你会收到一段来自视觉模型对图片的描述（格式可能不规范），请根据描述内容输出严格的纯 JSON 分析，不要任何额外文字。

## 输出格式
{"imageType":"<portrait|object|food|scene|pet|other>","mainEntity":"<核心主体完整描述，10-25字>","sceneState":"<物理环境与氛围，15-40字，必须与mainEntity内容不同>","userEmotion":"<从枚举里选1个>","evidence":"<支撑情绪的视觉线索，≤20字>","emotionCandidates":[{"label":"<枚举情绪>","score":0.0},{"label":"<枚举情绪>","score":0.0},{"label":"<枚举情绪>","score":0.0}],"styleHints":["<改写方向1>","<改写方向2>","<改写方向3>"]}

## 情绪枚举（必须从中选1个）
崩溃、烦躁、尴尬、无奈、焦虑、疲惫、委屈、开心、兴奋、无聊、平静、好奇、迷茫

## 要求
- mainEntity：具体说明"看到了什么"（数量+状态+物体名称）
- sceneState：具体说明"在哪里、什么光线、什么时间氛围"
- 禁止输出 markdown 代码块
- 禁止在 JSON 外输出任何内容`;

async function reanalyzeFromRawText(input: {
  requestId: string;
  rawContent: string;
  userNote?: string;
}): Promise<VisionAnalysis | null> {
  const { requestId, rawContent, userNote } = input;

  // 尝试从 rawContent 中递归提取所有字符串，无论格式
  let allText: string;
  try {
    const anyParsed = JSON.parse(extractJSON(rawContent));
    const strings = extractAllText(anyParsed);
    // 去重并过滤掉过短的片段
    const unique = Array.from(new Set(strings)).filter((s) => s.length > 2);
    allText = unique.join("；");
  } catch {
    // rawContent 本身不是 JSON，直接当作文本使用
    allText = rawContent.trim();
  }

  if (!allText || allText.length < 10) {
    console.error(`[vision][${requestId}] reanalyze: extracted text too short (${allText.length})`);
    return null;
  }

  console.error(`[vision][${requestId}] reanalyze: extracted ${allText.length} chars, calling HY-3 Preview`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const userMsg = [
      "以下是视觉模型对图片的原始描述（格式不规范，请根据内容提炼并按规定 JSON 格式输出）：",
      allText,
      userNote?.trim() ? `用户补充说明：${userNote.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const res = await fetch(tokenHubChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_TEXT_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify({
        model: TOKENHUB_EMOTION_MODEL,
        messages: [
          { role: "system", content: REANALYZE_SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        temperature: 0.15,
        max_tokens: TOKENHUB_MAX_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[vision][${requestId}] reanalyze upstream not ok`, res.status);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return null;

    const jsonStr = extractJSON(content);
    const parsed = JSON.parse(jsonStr) as Partial<VisionAnalysis>;

    const mainEntity = normalizeText(parsed.mainEntity);
    const sceneState = normalizeText(parsed.sceneState);
    const userEmotion = normalizeText(parsed.userEmotion);

    if (!mainEntity || !sceneState || !userEmotion) return null;

    const normalizedEmotion = normalizeEmotionToEnum({
      userEmotion,
      mainEntity,
      sceneState,
    });

    const candidates = Array.isArray(parsed.emotionCandidates)
      ? (parsed.emotionCandidates as Array<{ label?: unknown; score?: unknown }>)
          .map((c) => {
            const label = typeof c.label === "string" ? c.label.trim() : "";
            const score =
              typeof c.score === "number"
                ? c.score
                : typeof c.score === "string"
                ? Number(c.score)
                : NaN;
            if (!label || !Number.isFinite(score)) return null;
            if (!EMOTION_ENUM.includes(label as (typeof EMOTION_ENUM)[number])) return null;
            return { label, score: Math.max(0, Math.min(1, score)) };
          })
          .filter((v): v is { label: string; score: number } => !!v)
          .slice(0, 3)
      : [];

    console.error(`[vision][${requestId}] reanalyze success`, { mainEntity, sceneState, userEmotion: normalizedEmotion });

    return {
      imageType: normalizeImageType(parsed.imageType),
      mainEntity: smartTrim(mainEntity, MAX_MAIN_ENTITY_LEN),
      sceneState: smartTrim(sceneState, MAX_SCENE_STATE_LEN),
      userEmotion: normalizedEmotion,
      styleHints: Array.isArray(parsed.styleHints)
        ? parsed.styleHints.map(String).slice(0, 3)
        : DEFAULT_STYLE_HINTS,
      evidence: typeof parsed.evidence === "string" ? parsed.evidence.trim() : undefined,
      emotionCandidates: candidates.length ? candidates : undefined,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      console.error(`[vision][${requestId}] reanalyze timeout`);
    } else {
      console.error(`[vision][${requestId}] reanalyze exception`, e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function calibrateEmotionFromText(input: {
  requestId: string;
  description: string;
  userNote?: string;
}): Promise<null | { userEmotion: string; score?: number; reason?: string }> {
  const { requestId, description, userNote } = input;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const sys = `你是情绪判别器。根据场景描述，输出严格 JSON，不要任何多余文字。\n\n## 情绪枚举\n${EMOTION_ENUM.join("、")}\n\n## 输出格式\n{"userEmotion":"<枚举之一>","score":0.0,"reason":"<一句话证据，≤28字>"}\n\n## 要求\n- 必须选择一个最贴切的情绪\n- 置信度 score 为 0-1\n- reason 必须引用描述线索，不要物体清单`;

    const user = [
      "以下是图片的场景描述（来自视觉模型），请判定用户更可能的情绪：",
      description.trim(),
      userNote?.trim() ? `用户补充：${userNote.trim()}` : "",
    ].filter(Boolean).join("\n\n");

    const res = await fetch(tokenHubChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_TEXT_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify({
        model: TOKENHUB_EMOTION_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 180,
        stream: false,
      }),
      signal: controller.signal,
    });

    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error(`[vision][${requestId}] calibrate upstream not ok`, res.status, safeSnippet(rawText, 220));
      return null;
    }

    let payload: unknown = rawText;
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      // ignore
    }
    const obj = payload as { choices?: Array<{ message?: { content?: string; reasoning_content?: string } }> };
    const msg = obj.choices?.[0]?.message;
    const content = (msg?.content?.trim() || msg?.reasoning_content?.trim() || "").trim();
    if (!content) return null;
    const jsonStr = extractJSON(content);
    const parsed = JSON.parse(jsonStr) as Partial<{ userEmotion: string; score: number; reason: string }>;
    const em = typeof parsed.userEmotion === "string" ? parsed.userEmotion.trim() : "";
    if (!em || !EMOTION_ENUM.includes(em as (typeof EMOTION_ENUM)[number])) return null;
    const score = typeof parsed.score === "number" ? parsed.score : undefined;
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : undefined;
    return { userEmotion: em, score, reason };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      console.error(`[vision][${requestId}] calibrate timeout`);
      return null;
    }
    console.error(`[vision][${requestId}] calibrate exception`, e);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ----------------------------------------------------------------
 * 主路由处理器
 * ---------------------------------------------------------------- */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID().slice(0, 8);

  /* 1. 环境变量检查 */
  if (!TOKENHUB_MAAS_API_KEY) {
    console.error(`[vision][${requestId}] TOKENHUB_MAAS_API_KEY 未配置`);
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
  console.error(
    `[vision][${requestId}] incoming`,
    JSON.stringify({
      model: selectedModel,
      hasUserNote: Boolean(userNote?.trim()),
      imagePrefix: imageBase64.slice(0, 32),
      imageChars: imageBase64.length,
    })
  );

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

    const upstreamRes = await fetch(tokenHubMaasChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_MAAS_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => upstreamRes.statusText);
      console.error(
        `[vision][${requestId}] upstream not ok`,
        upstreamRes.status,
        safeSnippet(errText, 300)
      );
      return errorResponse(
        "UPSTREAM_ERROR",
        `大模型服务异常（${upstreamRes.status}）：${errText.slice(0, 200)}（请求号：${requestId}）`,
        502
      );
    }

    const upstreamData = (await upstreamRes.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      error?: { message: string };
    };

    if (upstreamData.error) {
      console.error(`[vision][${requestId}] upstream error:`, upstreamData.error);
      return errorResponse(
        "UPSTREAM_ERROR",
        `模型返回错误：${upstreamData.error.message}（请求号：${requestId}）`,
        502
      );
    }

    rawContent = upstreamData.choices?.[0]?.message?.content ?? "";

    if (!rawContent) {
      console.error(`[vision][${requestId}] empty content`, upstreamData);
      return errorResponse("UPSTREAM_ERROR", `模型返回内容为空（请求号：${requestId}）`, 502);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return errorResponse("TIMEOUT", `AI 感知超时，请稍后重试（请求号：${requestId}）`, 504);
    }
    console.error(`[vision][${requestId}] fetch 异常：`, err);
    return errorResponse("UPSTREAM_ERROR", `连接大模型服务失败（请求号：${requestId}）`, 502);
  }

  /* 6. 解析 JSON */
  let analysis: VisionAnalysis;
  let parsePath: "strict" | "description" | "scene" | "elements" | "fallback" = "fallback";

  try {
    console.error(`[vision][${requestId}] rawContent`, safeSnippet(rawContent, 220));
    const jsonStr = extractJSON(rawContent);
    console.error(`[vision][${requestId}] extractedJSON`, safeSnippet(jsonStr, 220));
    const parsed = JSON.parse(jsonStr) as Partial<VisionAnalysis> & {
      image_type?: string;
      main_entity?: string;
      scene_state?: string;
      user_emotion?: string;
      style_hints?: string[];
      emotion_candidates?: Array<{
        label?: unknown;
        score?: unknown;
        emotion?: unknown;
        confidence?: unknown;
      }>;
      description?: string;
      imageDescription?: string;
      image_description?: string;
      scene_description?: string;
      sceneDescription?: string;
      caption?: string;
      scene?: string;
      setting?: string;
      objects?: unknown;
      elements?: unknown;
      details?: unknown;
      evidence?: string;
      /* youtu-vita 插画/动漫输出字段 */
      characters?: unknown;
      colors?: unknown;
      mainObject?: string;
      main_object?: string;
      emotionCandidates?: Array<{
        label?: unknown;
        score?: unknown;
        emotion?: unknown;
        confidence?: unknown;
      }>;
    };

    let resolved: VisionAnalysis | null = null;

    const strictMainEntity = normalizeText(parsed.mainEntity ?? parsed.main_entity);
    const strictSceneState = normalizeText(parsed.sceneState ?? parsed.scene_state);
    const strictUserEmotion = normalizeText(parsed.userEmotion ?? parsed.user_emotion);
    const strictImageType = parsed.imageType ?? parsed.image_type;
    const strictStyleHints = parsed.styleHints ?? parsed.style_hints;
    const strictEmotionCandidates = parsed.emotionCandidates ?? parsed.emotion_candidates;

    if (strictMainEntity && strictSceneState && strictUserEmotion) {
      const normalizedEmotion = normalizeEmotionToEnum({
        userEmotion: strictUserEmotion,
        mainEntity: strictMainEntity,
        sceneState: strictSceneState,
        evidence: typeof parsed.evidence === "string" ? parsed.evidence : undefined,
      });

      const candidates = Array.isArray(strictEmotionCandidates)
        ? strictEmotionCandidates
            .map((c) => {
              const rawLabel = (c as { label?: unknown; emotion?: unknown }).label ?? (c as { emotion?: unknown }).emotion;
              const rawScore = (c as { score?: unknown; confidence?: unknown }).score ?? (c as { confidence?: unknown }).confidence;
              const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
              const score = typeof rawScore === "number" ? rawScore : (typeof rawScore === "string" ? Number(rawScore) : NaN);
              if (!label || !Number.isFinite(score)) return null;
              if (!EMOTION_ENUM.includes(label as (typeof EMOTION_ENUM)[number])) return null;
              return { label, score: Math.max(0, Math.min(1, score)) };
            })
            .filter((v): v is { label: string; score: number } => !!v)
            .slice(0, 3)
        : [];

      resolved = {
        imageType: normalizeImageType(strictImageType),
        mainEntity: smartTrim(strictMainEntity, MAX_MAIN_ENTITY_LEN),
        sceneState: smartTrim(strictSceneState, MAX_SCENE_STATE_LEN),
        userEmotion: normalizedEmotion,
        styleHints: Array.isArray(strictStyleHints)
          ? strictStyleHints.map(String).slice(0, 3)
          : undefined,
        evidence: typeof parsed.evidence === "string" ? parsed.evidence.trim() : undefined,
        emotionCandidates: candidates.length ? candidates : undefined,
      };
      parsePath = "strict";
    }

    if (!resolved && typeof parsed.description === "string" && parsed.description.trim()) {
      /* youtu-vita 偶发只输出 { description }，与契约不一致时从长描述映射为感知结构 */
      resolved = mapAnalysisFromDescription({
        description: parsed.description,
        imageType: parsed.imageType,
        styleHints: parsed.styleHints,
        evidence: parsed.evidence,
      });
      parsePath = "description";
    }

    if (!resolved && typeof parsed.imageDescription === "string" && parsed.imageDescription.trim()) {
      resolved = mapAnalysisFromDescription({
        description: parsed.imageDescription,
        imageType: parsed.imageType ?? parsed.image_type,
        styleHints: parsed.styleHints ?? parsed.style_hints,
        evidence: parsed.evidence,
      });
      parsePath = "description";
    }

    if (!resolved && typeof parsed.image_description === "string" && parsed.image_description.trim()) {
      resolved = mapAnalysisFromDescription({
        description: parsed.image_description,
        imageType: parsed.imageType ?? parsed.image_type,
        styleHints: parsed.styleHints ?? parsed.style_hints,
        evidence: parsed.evidence,
      });
      parsePath = "description";
    }

    if (!resolved) {
      // ── characters 路径（优先于 descLike）──────────────────────────────────
      // 兼容 youtu-vita 对插画/动漫/人像图返回 { characters, setting, colors } 的格式。
      // 此路径必须在 descLike 之前执行，防止 setting="indoor" 之类的单词被当作 mainEntity。
      // 支持 youtu-vita 偶发使用的多种字段别名（role/type/name, description/desc/appearance/outfit）。
      if (Array.isArray(parsed.characters) && (parsed.characters as unknown[]).length > 0) {
        const chars = parsed.characters as Array<Record<string, unknown>>;
        const mainParts = chars
          .slice(0, 3)
          .map((c) => {
            // 尝试多种 name 字段别名
            const name = [c.name, c.character_name, c.role, c.type, c.gender]
              .find((v) => typeof v === "string" && (v as string).trim().length > 0)
              ?.toString().trim() ?? "";
            // 尝试多种 description 字段别名
            const desc = [c.description, c.desc, c.appearance, c.outfit, c.details, c.info]
              .find((v) => typeof v === "string" && (v as string).trim().length > 0)
              ?.toString().trim() ?? "";
            const combined = name && desc
              ? `${name}（${smartTrim(desc, 22)}）`
              : smartTrim(desc || name, 30);
            return combined;
          })
          .filter(Boolean);

        if (mainParts.length) {
          const mainEntity = mainParts.slice(0, 2).join("与");
          // 从 setting/colors 提取场景描述；过滤掉纯英文单词（如 "indoor"）
          const settingRaw = typeof parsed.setting === "string" ? parsed.setting.trim() : "";
          // 如果 setting 是纯英文短词，映射为中文或留空
          const SETTING_MAP: Record<string, string> = {
            indoor: "室内场景", outdoor: "户外场景", office: "办公室",
            studio: "摄影棚", classroom: "教室", home: "家庭环境",
          };
          const settingNorm = SETTING_MAP[settingRaw.toLowerCase()] ?? (
            /^[a-zA-Z\s]{1,20}$/.test(settingRaw) ? "" : settingRaw
          );
          const colorsRaw = Array.isArray(parsed.colors)
            ? (parsed.colors as unknown[]).map(String).slice(0, 3).join("、")
            : "";
          const sceneState = settingNorm || (colorsRaw ? `以${colorsRaw}为主色调的插画背景` : "插画人物场景");

          resolved = {
            imageType: normalizeImageType(parsed.imageType ?? parsed.image_type ?? "portrait"),
            mainEntity: smartTrim(mainEntity, MAX_MAIN_ENTITY_LEN),
            sceneState: smartTrim(sceneState, MAX_SCENE_STATE_LEN),
            userEmotion: "好奇",
            styleHints: Array.isArray(parsed.styleHints)
              ? parsed.styleHints.map(String).slice(0, 3)
              : DEFAULT_STYLE_HINTS,
          };
          parsePath = "elements";
        }
      }
    }

    if (!resolved) {
      const descLike = (() => {
        if (typeof parsed.scene_description === "string" && parsed.scene_description.trim()) {
          return parsed.scene_description.trim();
        }
        if (typeof parsed.sceneDescription === "string" && parsed.sceneDescription.trim()) {
          return parsed.sceneDescription.trim();
        }
        if (typeof parsed.caption === "string" && parsed.caption.trim()) {
          return parsed.caption.trim();
        }
        // 注意：setting 字段不在此处理——已由上方 characters 路径或 reanalyzeFromRawText 负责，
        // 避免 "indoor"/"outdoor" 这类单词被误当作场景描述进入 mapAnalysisFromDescription。
        // 兼容 youtu-vita 偶发输出：{ scene, objects, details }
        // 同时纳入 main_object / mainObject 作为主体补充
        if (typeof parsed.scene === "string" && parsed.scene.trim()) {
          const mainObj =
            typeof parsed.mainObject === "string" ? parsed.mainObject.trim()
            : typeof parsed.main_object === "string" ? parsed.main_object.trim()
            : "";
          const objs = Array.isArray(parsed.objects)
            ? (parsed.objects as unknown[])
                .map((item) => {
                  if (typeof item === "string") return item.trim();
                  if (typeof item === "object" && item !== null) {
                    const o = item as Record<string, unknown>;
                    const v = o.name ?? o.label ?? o.description ?? o.text ?? o.caption ?? o.title;
                    return typeof v === "string" ? v.trim() : "";
                  }
                  return "";
                })
                .filter(Boolean)
                .slice(0, 6)
            : [];
          const allParts = mainObj ? [mainObj, ...objs].slice(0, 6) : objs;
          const tail = allParts.length ? `（主体：${allParts.join("、")}）` : "";
          return `${parsed.scene.trim()}${tail}`;
        }
        return "";
      })();

      if (descLike) {
        /* youtu-vita 偶发返回 scene_description / caption 等字段：按长描述兜底映射 */
        resolved = mapAnalysisFromDescription({
          description: descLike,
          imageType: parsed.imageType,
          styleHints: parsed.styleHints,
          evidence: parsed.evidence,
        });
        parsePath = "scene";
      }
    }

    if (!resolved) {
      resolved = mapAnalysisFromElements({
        elements: parsed.elements,
        imageType: parsed.imageType,
        styleHints: parsed.styleHints,
      });
      if (resolved) parsePath = "elements";
    }
    if (resolved) {
      resolved = enforceVisionBoundaries(resolved);
    }

    if (!resolved || !isUsableAnalysis(resolved)) {
      // 最后兜底：避免直接 500，给出可继续流程的极简感知
      resolved = {
        mainEntity: FALLBACK_MAIN_ENTITY,
        sceneState: FALLBACK_SCENE_STATE,
        userEmotion: "迷茫",
        evidence: FALLBACK_SCENE_STATE,
        styleHints: ["抽象派", "极简主义", "超现实主义"],
      };
      parsePath = "fallback";
    }

    analysis = resolved;
    console.error(
      `[vision][${requestId}] parse summary`,
      JSON.stringify({
        parsePath,
        isUsable: isUsableAnalysis(analysis),
        mainEntityLen: normalizeText(analysis.mainEntity).length,
        sceneStateLen: normalizeText(analysis.sceneState).length,
        userEmotion: normalizeText(analysis.userEmotion).slice(0, 12),
      })
    );
  } catch (err) {
    console.error(`[vision][${requestId}] JSON 解析失败`, err);
    // 不因视觉模型偶发自由文本/截断输出而中断主链路，交给后续文本兜底重整。
    analysis = {
      imageType: "other",
      mainEntity: smartTrim(rawContent || "视觉模型返回了非标准描述", MAX_MAIN_ENTITY_LEN),
      sceneState: "视觉模型返回格式不标准，需文本模型补全场景",
      userEmotion: "好奇",
      evidence: "模型输出需重整",
      styleHints: DEFAULT_STYLE_HINTS,
    };
    parsePath = "fallback";
  }

  // ── 两阶段解耦回退 ────────────────────────────────────────────────────────
  // 触发条件：无论 parsePath 是什么，只要最终 analysis 不可用（isUsableAnalysis=false），
  // 就把 youtu-vita 原始输出的所有文字交给 HY-3 Preview 重新按 schema 生成。
  // 覆盖场景：parsePath=fallback（完全解析失败）、以及 parsePath=scene 但 mainEntity
  // 是单个英文词（indoor 等）这类"表面上解析成功但内容无效"的情况。
  if (!isUsableAnalysis(analysis)) {
    try {
      const reanalyzed = await reanalyzeFromRawText({ requestId, rawContent, userNote });
      if (reanalyzed && isUsableAnalysis(reanalyzed)) {
        analysis = enforceVisionBoundaries(reanalyzed);
        console.error(`[vision][${requestId}] reanalyze rescued: mainEntityLen=${normalizeText(analysis.mainEntity).length}`);
      }
    } catch {
      // 不阻断主流程，继续使用 fallback 兜底值
    }
  }

  // 当 sceneState 为空（模型照搬 mainEntity 或字数过短被清空）时，用文本模型补充场景描述
  if (!analysis.sceneState?.trim()) {
    try {
      const sceneCtrl = new AbortController();
      const sceneTimer = setTimeout(() => sceneCtrl.abort(), UPSTREAM_TIMEOUT_MS);
      const sceneRes = await fetch(tokenHubChatCompletionsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKENHUB_TEXT_API_KEY}`, "User-Agent": "XTDDrama/1.0" },
        body: JSON.stringify({
          model: TOKENHUB_EMOTION_MODEL,
          messages: [
            {
              role: "system",
              content: `你是场景描述补充助手。根据图片主实体，补充一句 15-35 字的客观环境描述（空间、光线、时间氛围），不含情绪词，不重复主实体内容。只输出描述文字，不要任何解释。`,
            },
            { role: "user", content: `主实体：${analysis.mainEntity}\n请补充环境场景描述：` },
          ],
          temperature: 0.3,
          max_tokens: 100,
          stream: false,
        }),
        signal: sceneCtrl.signal,
      });
      clearTimeout(sceneTimer);
      if (sceneRes.ok) {
        const sceneData = (await sceneRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const sceneText = sceneData.choices?.[0]?.message?.content?.trim() ?? "";
        if (sceneText && sceneText.length >= 8) {
          analysis = { ...analysis, sceneState: smartTrim(sceneText, MAX_SCENE_STATE_LEN) };
        }
      }
    } catch {
      // 不阻断主流程
    }
  }

  // 当落入兜底描述路径，或候选置信度偏低时，尝试二次校准情绪（不引入手动纠错 UI）
  try {
    const evidenceText = analysis.evidence ?? "";
    const descForCalibrate = [analysis.mainEntity, analysis.sceneState, evidenceText].filter(Boolean).join("。");
    const topScore = Array.isArray(analysis.emotionCandidates) && analysis.emotionCandidates.length > 0
      ? Math.max(...analysis.emotionCandidates.map((x) => x.score))
      : null;
    const likelyWeak =
      analysis.userEmotion === "好奇" ||
      analysis.userEmotion === "迷茫" ||
      (typeof topScore === "number" && topScore < 0.55);
    if (descForCalibrate && likelyWeak) {
      const calibrated = await calibrateEmotionFromText({
        requestId,
        description: descForCalibrate,
        userNote,
      });
      if (calibrated?.userEmotion && calibrated.userEmotion !== analysis.userEmotion) {
        analysis = {
          ...analysis,
          userEmotion: calibrated.userEmotion,
          evidence: calibrated.reason || analysis.evidence,
          emotionCandidates: analysis.emotionCandidates,
        };
      }
    }
  } catch {
    // 不阻断主流程
  }

  /* 7. 最终兜底：确保 sceneState 永远非空，防止 guess 路由校验拒绝 */
  if (!analysis.sceneState?.trim()) {
    analysis = {
      ...analysis,
      sceneState: analysis.mainEntity
        ? `包含${analysis.mainEntity}的日常场景`
        : "普通日常场景",
    };
  }

  /* 8. 返回结果 */
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
