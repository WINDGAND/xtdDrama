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
 * 速度优化参数（可通过环境变量配置）：
 *   TOKENHUB_VIDEO_RESOLUTION  生成分辨率（默认 "540p"，降低可显著加快生成）
 *   TOKENHUB_VIDEO_LENGTH      帧数（默认 33，约 1.3 秒 @24fps；原始默认值为 121 帧）
 *
 * 返回：{ success: true, data: { id, status, ... } }
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenHubPost, requireTokenHubKey, type TokenHubError } from "@/lib/tokenhub";
import type {
  VideoApiFail,
  VideoApiResponse,
  VideoSubmitBody,
  VideoSubmitResponse,
} from "@/types/video";

const DEFAULT_MODEL = process.env.TOKENHUB_VIDEO_MODEL ?? "hy-video-1.5";
// Live 图只需 1-2 秒，33 帧 @24fps ≈ 1.3s；原始默认值为 121 帧（5 秒），大幅减帧可显著缩短生成时间
const VIDEO_LENGTH = Number(process.env.TOKENHUB_VIDEO_LENGTH ?? "33");
// 540p 相比默认 720p 减少约 40% 计算量，Live 图小尺寸够用
const VIDEO_RESOLUTION = process.env.TOKENHUB_VIDEO_RESOLUTION ?? "540p";

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
    requireTokenHubKey();

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
      // 速度优化：限制帧数与分辨率，避免生成远超 Live 图所需的长视频
      resolution: VIDEO_RESOLUTION,
      video_length: VIDEO_LENGTH,
    };
    if (firstImageUrl) {
      upstreamBody.image = { url: firstImageUrl };
    }

    const upstream = await tokenHubPost<VideoSubmitResponse>({
      path: "/v1/api/video/submit",
      body: upstreamBody,
    });

    return NextResponse.json<VideoApiResponse<VideoSubmitResponse>>(
      { success: true, data: upstream },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("TOKENHUB_API_KEY")) {
      return fail("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
    }
    const e = err as TokenHubError;
    const msg = e?.message ?? "提交视频任务失败";
    const status = e?.status ?? 502;
    const code: VideoApiFail["code"] = status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR";
    return fail(code, msg, status);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
