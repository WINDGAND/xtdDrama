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
      .from("comments")
      .select("id, created_at, author_type, user_id, npc_id, display_name, parent_id, content, status")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[comments/list] select error:", error);
      return fail("DB_ERROR", "读取评论失败：请确认已创建 comments / npc_profiles 表", 502);
    }

    return ok({ data: data ?? [] }, { status: 200 });
  } catch (err: unknown) {
    console.error("[comments/list] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "读取异常", 500);
  }
}

