/**
 * /api/image/submit — 提交 HY-Image 生图任务（TokenHub）
 *
 * 前端 -> 本路由 -> TokenHub /v1/api/image/submit
 *
 * 说明：
 *  - 使用 process.env.TOKENHUB_API_KEY 进行 Bearer 鉴权
 *  - 请求体仅允许 prompt（必填）与 model（可选，默认 hy-image-v3.0）
 *  - 返回上游的 id 等字段（不做业务假设）
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenHubPost, requireTokenHubKey, type TokenHubError } from "@/lib/tokenhub";
import type { ApiFail, ApiResponse, ImageSubmitBody, ImageSubmitResponse } from "@/types/image";

const DEFAULT_MODEL = process.env.TOKENHUB_IMAGE_MODEL ?? "hy-image-v3.0";

function fail(
  code: ApiFail["code"],
  error: string,
  status: number
) {
  return NextResponse.json({ success: false, code, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // env guard
    requireTokenHubKey();

    const body = (await req.json()) as Partial<ImageSubmitBody>;
    const prompt = body.prompt?.trim();
    const model = (body.model ?? DEFAULT_MODEL).trim();
    const images = body.images;

    if (!prompt) {
      return fail("INVALID_INPUT", "缺少 prompt", 400);
    }

    const upstream = await tokenHubPost<ImageSubmitResponse>({
      path: "/v1/api/image/submit",
      body: {
        model,
        prompt,
        ...(Array.isArray(images) && images.length > 0 ? { images } : {}),
      },
    });

    return NextResponse.json<ApiResponse<ImageSubmitResponse>>(
      { success: true, data: upstream },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("TOKENHUB_API_KEY")) {
      return fail("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
    }
    const e = err as TokenHubError;
    const msg = e?.message ?? "提交失败";
    const status = e?.status ?? 502;
    const code = status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR";
    return fail(code, msg, status);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

