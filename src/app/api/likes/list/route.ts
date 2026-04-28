import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const postId = String(searchParams.get("postId") ?? "").trim();
    if (!postId) return fail("INVALID_INPUT", "缺少 postId", 400);

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("post_likes")
      .select("id, created_at, actor_type, user_id, npc_id, display_name")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      // 点赞是“氛围组件”，不应阻断主流程：库表未初始化/权限问题时，降级为无点赞
      // 常见：未执行 supabase-schema.sql（post_likes 表不存在）
      console.error("[likes/list] db error (degraded to empty):", error);
      return ok({ data: [] }, { status: 200 });
    }

    return ok({ data: data ?? [] }, { status: 200 });
  } catch (err: unknown) {
    console.error("[likes/list] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "异常", 500);
  }
}

