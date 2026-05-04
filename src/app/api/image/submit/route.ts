/**
 * /api/image/submit — 提交 HY-Image 生图任务（TokenHub）
 *
 * 前端 -> 本路由 -> TokenHub /v1/api/image/submit
 *
 * 说明：
 *  - 使用 TOKENHUB_MAAS_API_KEY（未配置时回退 TOKENHUB_API_KEY）进行 Bearer 鉴权
 *  - 请求体允许 prompt（必填）、model（可选）、images（可选参考图 URL 列表）、resolution（可选；如 origin 或「宽:高」）
 *  - 校验上游返回体必须含 id，否则将上游业务错误透传给前端，避免前端只能显示「提交失败」
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenHubMaasPost, type TokenHubError } from "@/lib/tokenhub";
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
    const body = (await req.json()) as Partial<ImageSubmitBody>;
    const prompt = body.prompt?.trim();
    const model = (body.model ?? DEFAULT_MODEL).trim();
    const images = body.images;
    const hasImages = Array.isArray(images) && images.length > 0;
    const resolutionTrim =
      typeof body.resolution === "string" && body.resolution.trim() ? body.resolution.trim() : "";

    if (!prompt) {
      return fail("INVALID_INPUT", "缺少 prompt", 400);
    }

    // TokenHub HY-Image 以 Resolution 字符串控制输出；单独传 width/height 无效。
    // 有参考图时默认 origin，与「图生图」文档一致，避免落到 1024:1024 等与参考图比例不一致导致裁切。
    const resolution = resolutionTrim
      ? resolutionTrim
      : hasImages
        ? "origin"
        : "1024:1024";

    const upstream = await tokenHubMaasPost<Record<string, unknown>>({
      path: "/v1/api/image/submit",
      body: {
        model,
        prompt,
        ...(hasImages ? { images } : {}),
        // 文档参数名为 Resolution；本网关请求体其余字段为小写，部分环境可能只识别其一，故双写。
        Resolution: resolution,
        resolution,
      },
    });

    // 上游业务错误：HTTP 200 但返回体没有任务 id（常见于参数校验失败、配额超限等）
    if (!upstream?.id) {
      const upstreamMsg =
        (upstream as { message?: string; msg?: string; error?: string })?.message ??
        (upstream as { message?: string; msg?: string; error?: string })?.msg ??
        (upstream as { message?: string; msg?: string; error?: string })?.error ??
        JSON.stringify(upstream).slice(0, 200);
      console.error("[image/submit] 上游未返回 id，原始响应：", JSON.stringify(upstream).slice(0, 400));
      return fail("UPSTREAM_ERROR", `生图服务拒绝请求：${upstreamMsg}`, 502);
    }

    return NextResponse.json<ApiResponse<ImageSubmitResponse>>(
      { success: true, data: upstream as unknown as ImageSubmitResponse },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("API_KEY")) {
      return fail("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
    }
    const e = err as TokenHubError;
    const msg = e?.message ?? "提交失败";
    const status = e?.status ?? 502;
    const code = status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR";
    console.error("[image/submit] 请求异常：", msg, "status:", status);
    return fail(code, msg, status);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

