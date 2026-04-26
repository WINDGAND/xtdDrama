import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("posts")
      .select("id, created_at, mode, style, result_url, main_entity, scene_state, user_emotion")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("[posts/list] select error:", error);
      return fail(
        "DB_ERROR",
        "读取失败：请先在 Supabase 执行 supabase-schema.sql 创建 posts 表",
        502
      );
    }

    return ok({ data: data ?? [] }, { status: 200 });
  } catch (err: unknown) {
    console.error("[posts/list] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "读取异常", 500);
  }
}

