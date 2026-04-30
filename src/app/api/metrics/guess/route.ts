import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      event?: string;
      batchIndex?: number;
      optionTitle?: string;
      dedupLevel?: string;
      hasUserHint?: boolean;
      at?: number;
    };
    console.info("[guess-metric]", {
      event: body.event ?? "unknown",
      batchIndex: body.batchIndex ?? null,
      optionTitle: body.optionTitle ?? null,
      dedupLevel: body.dedupLevel ?? null,
      hasUserHint: body.hasUserHint ?? null,
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
