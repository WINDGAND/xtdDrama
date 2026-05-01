/**
 * /api/drama/evaluate — 生成结果一致性评估
 *
 * 职责（对应 P0-2 一致性"可量化"改造）：
 *   接收 analysis（感知层输出）+ resultUrl（生成结果图 URL），
 *   调用视觉模型实际观察生成图，对比三个维度：
 *     - subjectMatch   主体是否可识别（保留了原图主体）
 *     - emotionMatch   情绪氛围是否与预期方向对齐
 *     - shareability   是否符合年轻人可分享的梗图调性
 *   每项 0–100 分，输出综合评分与简短建议。
 *
 * 用途：
 *   - 低分时，前端提示用户"换一个风格生成"
 *   - 展示给评委，证明"生成结果可量化、不是随机"
 */

import { NextRequest, NextResponse } from "next/server";
import { extractJSON } from "@/lib/extract-json";
import { randomUUID } from "crypto";
import type { VisionAnalysis } from "@/types/vision";

const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL =
  process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
const TOKENHUB_EVAL_MODEL =
  process.env.TOKENHUB_NPC_VISION_MODEL ??
  process.env.TOKENHUB_VITA_MODEL ??
  "youtu-vita";
const TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "25000");

interface EvaluateBody {
  /** 原始感知结构（来自 /api/vision） */
  analysis: VisionAnalysis;
  /** 生成结果图的可访问 URL */
  resultUrl: string;
  /** 用户选择的风格名称（用于 prompt 上下文） */
  style?: string;
}

interface EvaluateResult {
  /** 主体可识别度（0–100） */
  subjectMatch: number;
  /** 情绪氛围吻合度（0–100） */
  emotionMatch: number;
  /** 可分享梗图调性（0–100） */
  shareability: number;
  /** 综合分（三项均值） */
  overall: number;
  /** 一句话评语（给用户看） */
  verdict: string;
  /** 是否建议重生图（overall < 60） */
  suggestRetry: boolean;
}

const SYSTEM_PROMPT = `你是一位专业的视觉质量评审员，擅长评估 AI 生成图与原始场景的一致性。

## 任务
根据用户提供的"原始场景描述"与"生成结果图"，输出**纯 JSON**评分，不要任何解释或 markdown。

## 评分维度（每项 0-100 整数）
- subjectMatch：生成图中的主体是否仍可识别为原图主体？（0=完全看不出，100=主体清晰保留）
- emotionMatch：生成图的整体氛围是否与原始情绪标签方向一致？（0=完全相反，100=完全吻合）
- shareability：生成图是否符合"年轻人愿意发朋友圈/广场"的梗图调性？（0=无聊/令人不适，100=极具传播性）

## 输出格式（严格遵守）
{"subjectMatch":整数,"emotionMatch":整数,"shareability":整数,"verdict":"<15-35字评语，中文，口语化>"}

## 示例输出
{"subjectMatch":82,"emotionMatch":75,"shareability":90,"verdict":"主体依稀可辨，情绪氛围接近，梗感拉满，适合发广场。"}

## 重要
- 只输出纯 JSON，禁止 \`\`\`json
- verdict 必须中文，15-35 字`;

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID().slice(0, 8);

  if (!TOKENHUB_API_KEY) {
    return fail("服务配置异常，TOKENHUB_API_KEY 未设置", 500);
  }

  let body: Partial<EvaluateBody>;
  try {
    body = (await req.json()) as Partial<EvaluateBody>;
  } catch {
    return fail("请求体格式错误");
  }

  const { analysis, resultUrl, style } = body;

  if (!analysis?.mainEntity || !analysis?.userEmotion) {
    return fail("缺少 analysis（mainEntity / userEmotion）");
  }

  const trimmedUrl = String(resultUrl ?? "").trim();
  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    return fail("resultUrl 格式不合法");
  }

  const userContent = [
    {
      type: "image_url",
      image_url: { url: trimmedUrl },
    },
    {
      type: "text",
      text: [
        "以下是这张图的原始场景描述，请据此评分：",
        `主体：${analysis.mainEntity}`,
        `场景：${analysis.sceneState ?? "未知"}`,
        `情绪：${analysis.userEmotion}`,
        style ? `风格方向：${style}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const baseUrl = TOKENHUB_BASE_URL.endsWith("/")
      ? TOKENHUB_BASE_URL.slice(0, -1)
      : TOKENHUB_BASE_URL;

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify({
        model: TOKENHUB_EVAL_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.15,
        max_tokens: 220,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[evaluate][${requestId}] upstream ${res.status}:`, errText.slice(0, 200));
      return fail(`模型服务异常（${res.status}）`, 502);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    };
    const msg = data.choices?.[0]?.message;
    const rawContent = (msg?.content?.trim() || msg?.reasoning_content?.trim() || "").trim();

    if (!rawContent) return fail("模型返回内容为空", 502);

    let parsed: Partial<{
      subjectMatch: number;
      emotionMatch: number;
      shareability: number;
      verdict: string;
    }>;

    try {
      parsed = JSON.parse(extractJSON(rawContent)) as typeof parsed;
    } catch {
      console.error(`[evaluate][${requestId}] parse error:`, rawContent.slice(0, 200));
      return fail("评分结果解析失败", 500);
    }

    const clamp = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v ?? 70);
      return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 70)));
    };

    const subjectMatch = clamp(parsed.subjectMatch);
    const emotionMatch = clamp(parsed.emotionMatch);
    const shareability = clamp(parsed.shareability);
    const overall = Math.round((subjectMatch + emotionMatch + shareability) / 3);
    const verdict =
      typeof parsed.verdict === "string" && parsed.verdict.trim()
        ? parsed.verdict.trim()
        : overall >= 80
          ? "整体效果不错，主体清晰，氛围到位。"
          : overall >= 60
            ? "效果中等，可以发布，也可以换风格重试。"
            : "主体或氛围偏差较大，建议换个风格重新生成。";

    const result: EvaluateResult = {
      subjectMatch,
      emotionMatch,
      shareability,
      overall,
      verdict,
      suggestRetry: overall < 60,
    };

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return fail("评估超时，请稍后重试", 504);
    }
    console.error(`[evaluate][${requestId}] exception:`, err);
    return fail(err instanceof Error ? err.message : "评估异常", 500);
  } finally {
    clearTimeout(tid);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
