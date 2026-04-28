import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";

const NPCS: Array<{ npc_id: string; display_name: string }> = [
  { npc_id: "emma", display_name: "Emma" },
  { npc_id: "liam", display_name: "Liam" },
  { npc_id: "olivia", display_name: "Olivia" },
  { npc_id: "noah", display_name: "Noah" },
  { npc_id: "sophia", display_name: "Sophia" },
];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<{ postId: string }>;
    const postId = String(body.postId ?? "").trim();
    if (!postId) return fail("INVALID_INPUT", "缺少 postId", 400);

    const supabase = createServerSupabaseClient();
    const rows = NPCS.map((x) => ({
      post_id: postId,
      actor_type: "npc" as const,
      npc_id: x.npc_id,
      display_name: x.display_name,
    }));

    const { error } = await supabase.from("post_likes").insert(rows);
    if (error) {
      // 幂等：唯一索引冲突时视为已生成
      const msg = String((error as { message?: unknown }).message ?? "");
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        return ok({ generated: false }, { status: 200 });
      }
      console.error("[likes/npc-generate] insert error:", error);
      return fail("DB_ERROR", "写入点赞失败", 502);
    }

    return ok({ generated: true }, { status: 200 });
  } catch (err: unknown) {
    console.error("[likes/npc-generate] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

