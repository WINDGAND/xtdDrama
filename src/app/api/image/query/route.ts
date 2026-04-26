/**
 * /api/image/query — 查询 HY-Image 生图任务结果（TokenHub）
 *
 * 前端 -> 本路由 -> TokenHub /v1/api/image/query
 *
 * 请求体：{ id, model? }
 * 返回：上游原样透传（不强绑定字段结构）
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenHubPost, requireTokenHubKey, type TokenHubError } from "@/lib/tokenhub";
import type { ApiFail, ApiResponse, ImageQueryBody, ImageQueryResponse } from "@/types/image";

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
    requireTokenHubKey();

    const body = (await req.json()) as Partial<ImageQueryBody>;
    const id = body.id?.trim();
    const model = (body.model ?? DEFAULT_MODEL).trim();

    if (!id) {
      return fail("INVALID_INPUT", "缺少 id", 400);
    }

    const upstream = await tokenHubPost<ImageQueryResponse>({
      path: "/v1/api/image/query",
      body: { model, id },
    });

    return NextResponse.json<ApiResponse<ImageQueryResponse>>(
      { success: true, data: upstream },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("TOKENHUB_API_KEY")) {
      return fail("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
    }
    const e = err as TokenHubError;
    const msg = e?.message ?? "查询失败";
    const status = e?.status ?? 502;
    const code = status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR";
    return fail(code, msg, status);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

