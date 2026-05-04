/**
 * /api/video/query — 查询 HY-Video-1.5 视频任务结果（TokenHub）
 *
 * 对应官方示例：
 *   POST https://tokenhub.tencentmaas.com/v1/api/video/query
 *   { "model": "hy-video-1.5", "id": "xxxxxx" }
 *
 * 返回：{ success: true, data: { status, data: [{ url }], ... } }
 *   status: queued / processing / completed / failed
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenHubMaasPost, type TokenHubError } from "@/lib/tokenhub";
import type {
  VideoApiFail,
  VideoApiResponse,
  VideoQueryBody,
  VideoQueryResponse,
} from "@/types/video";

const DEFAULT_MODEL = process.env.TOKENHUB_VIDEO_MODEL ?? "hy-video-1.5";

function fail(code: VideoApiFail["code"], error: string, status: number) {
  return NextResponse.json({ success: false, code, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<VideoQueryBody>;
    const id = body.id?.trim();
    const model = (body.model ?? DEFAULT_MODEL).trim();

    if (!id) {
      return fail("INVALID_INPUT", "缺少 id", 400);
    }

    const upstream = await tokenHubMaasPost<VideoQueryResponse>({
      path: "/v1/api/video/query",
      body: { model, id },
    });

    return NextResponse.json<VideoApiResponse<VideoQueryResponse>>(
      { success: true, data: upstream },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("API_KEY")) {
      return fail("API_KEY_MISSING", "服务配置异常，API Key 未设置", 500);
    }
    const e = err as TokenHubError;
    const msg = e?.message ?? "查询视频任务失败";
    const status = e?.status ?? 502;
    const code: VideoApiFail["code"] = status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR";
    return fail(code, msg, status);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
