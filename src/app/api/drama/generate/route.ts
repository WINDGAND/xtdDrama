/**
 * /api/drama/generate — 图生图（HY-Image-V3.0）编排入口
 *
 * 产品链路拆分（避免把「文本推理」误当成「真视觉理解 / 真图生图」）：
 *
 *   1) 感知（可选但推荐）：POST /api/vision
 *      - 用 chat/completions + 多模态模型，产出结构化 JSON（mainEntity 等）
 *   2) 生图（图生图）：TokenHub HY-Image-V3.0
 *      - POST /v1/api/image/submit（可带 images: 公网可访问参考图 URL）
 *      - POST /v1/api/image/query 轮询直到 completed / failed
 *
 * 当前限制（必须向用户说明）：
 *   HY-Image 文档要求 images 为「可访问的图片地址」。
 *   若你只在前端有 base64、没有对象存储公网 URL，则无法把原图作为参考图喂给 HY-Image。
 *   本接口接受 referenceImageUrl；后续可接 Supabase Storage / COS 上传后填入。
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenHubPost, requireTokenHubKey, type TokenHubError } from "@/lib/tokenhub";
import type { ImageSubmitResponse, ImageQueryResponse } from "@/types/image";
import type { VisionAnalysis } from "@/types/vision";

const IMAGE_MODEL = process.env.TOKENHUB_IMAGE_MODEL ?? "hy-image-v3.0";
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_MS = 120_000;

interface DramaGenerateBody {
  /** 已由 /api/vision 解析好的结构化感知结果 */
  analysis: VisionAnalysis;
  /** 夸张化风格关键词，例如「克苏鲁吞噬风」 */
  style?: string;
  /**
   * 参考原图公网 URL（HY-Image images[]）
   * 无此字段时：仅文生图式 prompt（仍可能“像图生图”，但缺少结构锁定）
   */
  referenceImageUrl?: string;
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function buildDramaPrompt(analysis: VisionAnalysis, style?: string): string {
  const s = style?.trim();
  const hints =
    analysis.styleHints && analysis.styleHints.length > 0
      ? analysis.styleHints.join("、")
      : "赛博夸张梗图风、电影级光影、强对比";

  return [
    "你是混元生图引擎的提示词工程师。请严格保持参考图的空间结构与主体轮廓，只做戏剧性材质/氛围替换。",
    `主实体：${analysis.mainEntity}`,
    `场景状态：${analysis.sceneState}`,
    `情绪基调：${analysis.userEmotion}`,
    s ? `用户指定风格：${s}` : `风格候选：${hints}`,
    "画面要求：极度夸张、幽默、适合年轻人社交传播；避免血腥恐怖写实；保留主体可识别性。",
  ].join("\n");
}

function isTerminalStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const s = status.toLowerCase();
  return (
    s === "completed" ||
    s === "failed" ||
    s === "error" ||
    s === "canceled" ||
    s === "cancelled"
  );
}

export async function POST(req: NextRequest) {
  try {
    requireTokenHubKey();

    const body = (await req.json()) as Partial<DramaGenerateBody>;
    if (!body.analysis?.mainEntity || !body.analysis?.sceneState || !body.analysis?.userEmotion) {
      return fail("缺少 analysis（请先调用 /api/vision）", 400);
    }

    const prompt = buildDramaPrompt(body.analysis, body.style);
    const refUrl = body.referenceImageUrl?.trim();

    const submit = await tokenHubPost<ImageSubmitResponse>({
      path: "/v1/api/image/submit",
      body: {
        model: IMAGE_MODEL,
        prompt,
        ...(refUrl ? { images: [refUrl] } : {}),
      },
    });

    const jobId = submit.id;
    if (!jobId) {
      return fail("生图任务提交成功但未返回 id", 502);
    }

    const started = Date.now();
    let last: ImageQueryResponse | null = null;

    while (Date.now() - started < POLL_MAX_MS) {
      const q = await tokenHubPost<ImageQueryResponse>({
        path: "/v1/api/image/query",
        body: { model: IMAGE_MODEL, id: jobId },
      });
      last = q;
      const st = q.status;
      if (isTerminalStatus(st)) {
        return NextResponse.json(
          {
            success: true,
            jobId,
            status: st,
            data: q,
            prompt,
            usedReferenceImage: Boolean(refUrl),
          },
          { status: 200 }
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return NextResponse.json(
      {
        success: false,
        error: "生图任务轮询超时",
        jobId,
        last,
        prompt,
      },
      { status: 504 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("TOKENHUB_API_KEY")) {
      return fail("服务配置异常，API Key 未设置", 500);
    }
    const e = err as TokenHubError;
    return fail(e?.message ?? "生图失败", e?.status ?? 502);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
