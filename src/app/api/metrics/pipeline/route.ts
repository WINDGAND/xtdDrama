import { NextRequest, NextResponse } from "next/server";

/**
 * /api/metrics/pipeline — 完整主链路埋点接收端
 *
 * 写入 console.info 以便在 Vercel/日志平台检索；
 * 后续可无缝接入 Supabase analytics 表或第三方观测平台。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      event?: string;
      sourceType?: string;
      mode?: string;
      hasReference?: boolean;
      durationMs?: number;
      reason?: string;
      sessionId?: string;
      at?: number;
    };
    console.info("[pipeline-metric]", {
      event: body.event ?? "unknown",
      sourceType: body.sourceType ?? null,
      mode: body.mode ?? null,
      hasReference: body.hasReference ?? null,
      durationMs: body.durationMs ?? null,
      reason: body.reason ?? null,
      sessionId: body.sessionId ?? null,
      at: body.at ?? Date.now(),
    });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
