import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthServerClient();
    const { data: userData, error: userErr } = await auth.auth.getUser();
    if (userErr || !userData.user) return fail("INVALID_INPUT", "请先登录", 401);

    const body = (await req.json()) as Partial<{ id: string }>;
    const id = String(body.id ?? "").trim();
    if (!id) return fail("INVALID_INPUT", "缺少 id", 400);

    const supabase = createServerSupabaseClient();
    const { data: c, error: cErr } = await supabase
      .from("comments")
      .select("id, post_id, user_id, author_type")
      .eq("id", id)
      .maybeSingle();
    if (cErr || !c) return fail("NOT_FOUND", "评论不存在", 404);

    // 权限：评论作者 或 作品作者
    const uid = userData.user.id;
    let isPostOwner = false;
    try {
      const { data: p } = await supabase
        .from("posts")
        .select("user_id")
        .eq("id", c.post_id)
        .maybeSingle();
      isPostOwner = !!p?.user_id && String(p.user_id) === uid;
    } catch {
      // ignore
    }

    const isCommentOwner = !!c.user_id && String(c.user_id) === uid;
    if (!isCommentOwner && !isPostOwner) return fail("INVALID_INPUT", "无权限删除", 403);

    const { error: delErr } = await supabase.from("comments").delete().eq("id", id);
    if (delErr) {
      console.error("[comments/delete] delete error:", delErr);
      return fail("DB_ERROR", "删除失败", 502);
    }

    return ok({ deleted: true }, { status: 200 });
  } catch (err: unknown) {
    console.error("[comments/delete] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

