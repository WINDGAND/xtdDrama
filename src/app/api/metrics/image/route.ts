import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      event?: string;
      page?: string;
      slot?: string;
      srcHost?: string;
      durationMs?: number;
      reason?: string;
      at?: number;
    };
    // 先走日志基线，后续可接 Supabase/第三方观测平台。
    console.info("[image-metric]", {
      event: body.event ?? "unknown",
      page: body.page ?? "unknown",
      slot: body.slot ?? "unknown",
      srcHost: body.srcHost ?? "unknown",
      durationMs: body.durationMs ?? null,
      reason: body.reason ?? null,
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
