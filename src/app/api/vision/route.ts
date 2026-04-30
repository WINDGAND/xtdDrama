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
import { randomUUID } from "crypto";
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
const TOKENHUB_MAX_TOKENS = Number(process.env.TOKENHUB_MAX_TOKENS ?? "900");
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");
const TOKENHUB_EMOTION_MODEL =
  process.env.TOKENHUB_EMOTION_MODEL ?? process.env.TOKENHUB_GUESS_MODEL ?? "hunyuan-2.0-instruct-20251111";

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

const MAX_MAIN_ENTITY_LEN = 36;
const MAX_SCENE_STATE_LEN = 64;
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
{"imageType":"<portrait|object|food|scene|pet|other>","mainEntity":"<图像中最显著的核心主体，中文，完整短句，禁止半截词>","sceneState":"<当前物理环境的客观状态，中文，完整短句，不含主观情绪>","userEmotion":"<情绪标签，必须从枚举里选 1 个>","evidence":"<画面可见视觉线索，格式[视觉元素]+[状态]，≤20字，例如：桌面一片狼藉>","emotionCandidates":[{"label":"<枚举情绪>","score":0.0},{"label":"<枚举情绪>","score":0.0},{"label":"<枚举情绪>","score":0.0}],"styleHints":["<改写方向1>","<改写方向2>","<改写方向3>"]}

## 字段说明
- imageType: 画面主体类型，portrait=人像，object=物品，food=食物，scene=风景，pet=动物，other=其他
- mainEntity: 你实际看到的核心主体，例如"堆满试卷的桌面"、"洒落在地的咖啡"、"挤满人的地铁"；必须是完整短语，不要在词中间截断
- sceneState: 你看到的客观场景，例如"昏暗宿舍，屏幕蓝光，凌晨时分"；必须是完整短语，不含主观情绪，不要在词中间截断
- userEmotion: 图片整体传递的情绪氛围，从以下枚举里选 1 个最贴切的：${EMOTION_ENUM.join("、")}
- evidence: 引用支撑情绪判断的具体画面视觉元素，格式"[视觉元素]+[状态]"，例如"桌面一片狼藉"、"表情紧绷眉头皱"，禁止写物体清单或主观臆断
- emotionCandidates: 3 个候选情绪 + 置信度（0-1），按 score 从高到低排列
- styleHints: 3 个克制幽默、真实可分享的视觉改写方向，必须保留主体可辨认，禁止极端元素（克苏鲁/赛博朋克/末日/霓虹/恐怖/血腥）；根据 imageType 选择方向：portrait 偏漫画脸谱/画报人物，object 偏插画道具/绘本物品，food 偏美食插画/杂志感，scene 偏胶片/手账速写，pet 偏Q版/儿童绘本，other 偏漫画分镜/复古胶片

## 禁止事项
- 禁止在 JSON 之外输出任何文字或解释
- 禁止输出 Markdown 代码块（不要写 \`\`\`json）
- 禁止使用英文（所有值必须为中文，imageType 枚举值除外）
- 若图片无法识别，输出：{"imageType":"other","mainEntity":"未知场景","sceneState":"图像信息不足","userEmotion":"迷茫","evidence":"图像信息不足","emotionCandidates":[{"label":"迷茫","score":0.7},{"label":"好奇","score":0.2},{"label":"平静","score":0.1}],"styleHints":["漫画插画感","清新日系感","温柔胶片感"]}`;
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
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

function pickDistinctSceneState(mainEntity: string, candidates: string[]): string {
  const filtered = candidates
    .map((s) => normalizeText(s))
    .filter(Boolean)
    .filter((s) => !isNearDuplicateText(s, mainEntity));
  if (!filtered.length) return "场景信息较少";
  return smartTrim(filtered.slice(0, 2).join("；"), MAX_SCENE_STATE_LEN);
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
  const sceneState = pickDistinctSceneState(mainEntity, sceneCandidates.length ? sceneCandidates : [sceneRaw]);
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
  const sceneState = normalizeText(analysis.sceneState);
  if (!mainEntity || !sceneState) return false;
  if (mainEntity.length < 2 || sceneState.length < 2) return false;
  if (mainEntity === FALLBACK_MAIN_ENTITY) return false;
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

async function calibrateEmotionFromText(input: {
  requestId: string;
  description: string;
  userNote?: string;
}): Promise<null | { userEmotion: string; score?: number; reason?: string }> {
  const { requestId, description, userNote } = input;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const baseUrl = TOKENHUB_BASE_URL.endsWith("/") ? TOKENHUB_BASE_URL.slice(0, -1) : TOKENHUB_BASE_URL;
    const sys = `你是情绪判别器。根据场景描述，输出严格 JSON，不要任何多余文字。\n\n## 情绪枚举\n${EMOTION_ENUM.join("、")}\n\n## 输出格式\n{"userEmotion":"<枚举之一>","score":0.0,"reason":"<一句话证据，≤28字>"}\n\n## 要求\n- 必须选择一个最贴切的情绪\n- 置信度 score 为 0-1\n- reason 必须引用描述线索，不要物体清单`;

    const user = [
      "以下是图片的场景描述（来自视觉模型），请判定用户更可能的情绪：",
      description.trim(),
      userNote?.trim() ? `用户补充：${userNote.trim()}` : "",
    ].filter(Boolean).join("\n\n");

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
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
  if (!TOKENHUB_API_KEY) {
    console.error(`[vision][${requestId}] TOKENHUB_API_KEY 未配置`);
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
      objects?: unknown;
      elements?: unknown;
      details?: unknown;
      evidence?: string;
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
        // 兼容 youtu-vita 偶发输出：{ scene, objects, details }
        if (typeof parsed.scene === "string" && parsed.scene.trim()) {
          const objs = Array.isArray(parsed.objects)
            ? (parsed.objects as unknown[]).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 6)
            : [];
          const tail = objs.length ? `（物体：${objs.join("、")}）` : "";
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
    return errorResponse("PARSE_ERROR", `AI 返回格式异常，解析失败（请求号：${requestId}）`, 500);
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
