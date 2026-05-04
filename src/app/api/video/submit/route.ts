/**
 * /api/video/submit — 提交 HY-Video-1.5 图生视频任务（TokenHub）
 *
 * 对应官方示例：
 *   POST https://tokenhub.tencentmaas.com/v1/api/video/submit
 *   { "model": "hy-video-1.5", "prompt": "一只小狗" }
 *
 * 图生视频：请求体可传 `images: ["公网 HTTPS URL"]`（与前端一致）；本路由会映射为
 * TokenHub/混元要求的 `image: { url }`，勿把 `images` 数组原样转发上游（会 400 Invalid param）。
 *
 * 返回：{ success: true, data: { id, status, ... } }
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenHubMaasPost, type TokenHubError } from "@/lib/tokenhub";
import type {
  VideoApiFail,
  VideoApiResponse,
  VideoSubmitBody,
  VideoSubmitResponse,
} from "@/types/video";

const DEFAULT_MODEL = process.env.TOKENHUB_VIDEO_MODEL ?? "hy-video-1.5";

/** 混元生视频 Prompt 上限约 200 字（UTF-8 字符计），超长会触发上游 Invalid param */
function clipPromptForHunyuanVideo(prompt: string, maxChars: number): string {
  const chars = [...prompt];
  if (chars.length <= maxChars) return prompt;
  return chars.slice(0, maxChars).join("");
}

function fail(code: VideoApiFail["code"], error: string, status: number) {
  return NextResponse.json({ success: false, code, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<VideoSubmitBody>;
    const prompt = body.prompt?.trim();
    const model = (body.model ?? DEFAULT_MODEL).trim();
    const images = body.images;

    if (!prompt) {
      return fail("INVALID_INPUT", "缺少 prompt", 400);
    }

    const safePrompt = clipPromptForHunyuanVideo(prompt, 200);

    /**
     * HY-Video-1.5 与腾讯云 SubmitHunyuanToVideoJob 对齐：参考图为 `Image`（小写驼峰 `image`），
     * 字段为 `{ url }` 或 `{ base64 }`。传 `images: string[]` 会导致上游 400 Invalid param。
     */
    const firstImageUrl =
      Array.isArray(images) && images.length > 0
        ? String(images[0] ?? "").trim()
        : "";

    const upstreamBody: Record<string, unknown> = {
      model,
      prompt: safePrompt,
    };
    if (firstImageUrl) {
      upstreamBody.image = { url: firstImageUrl };
    }

    const upstream = await tokenHubMaasPost<Record<string, unknown>>({
      path: "/v1/api/video/submit",
      body: upstreamBody,
    });

    // 上游业务错误：HTTP 200 但返回体没有任务 id（常见于参数校验失败、配额超限等）
    if (!upstream?.id) {
      const upstreamMsg =
        (upstream as { message?: string; msg?: string; error?: string })?.message ??
        (upstream as { message?: string; msg?: string; error?: string })?.msg ??
        (upstream as { message?: string; msg?: string; error?: string })?.error ??
        JSON.stringify(upstream).slice(0, 200);
      console.error("[video/submit] 上游未返回 id，原始响应：", JSON.stringify(upstream).slice(0, 400));
      return fail("UPSTREAM_ERROR", `视频生成服务拒绝请求：${upstreamMsg}`, 502);
    }

    return NextResponse.json<VideoApiResponse<VideoSubmitResponse>>(
      { success: true, data: upstream as unknown as VideoSubmitResponse },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("API_KEY")) {
      return fail("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
    }
    const e = err as TokenHubError;
    const msg = e?.message ?? "提交视频任务失败";
    const status = e?.status ?? 502;
    const code: VideoApiFail["code"] = status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR";
    console.error("[video/submit] 请求异常：", msg, "status:", status);
    return fail(code, msg, status);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
