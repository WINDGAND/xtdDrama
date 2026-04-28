import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthServerClient();
    const { data: userData, error: userErr } = await auth.auth.getUser();
    if (userErr || !userData.user) return fail("INVALID_INPUT", "请先登录", 401);

    const body = (await req.json()) as Partial<{ postId: string; content: string; parentId?: string | null }>;
    const postId = String(body.postId ?? "").trim();
    const content = String(body.content ?? "").trim();
    const parentId = body.parentId ? String(body.parentId).trim() : null;
    if (!postId) return fail("INVALID_INPUT", "缺少 postId", 400);
    if (!content) return fail("INVALID_INPUT", "请输入评论内容", 400);
    if (content.length > 280) return fail("INVALID_INPUT", "评论过长（最多 280 字）", 400);

    const supabase = createServerSupabaseClient();

    // 若是回复，确认 parent 属于同一 post
    if (parentId) {
      const { data: p, error: pErr } = await supabase
        .from("comments")
        .select("id, post_id")
        .eq("id", parentId)
        .maybeSingle();
      if (pErr || !p) return fail("NOT_FOUND", "要回复的评论不存在", 404);
      if (String(p.post_id) !== postId) return fail("INVALID_INPUT", "回复目标不匹配", 400);
    }

    // 显示名：优先 profiles.display_name，其次 email 前缀
    let displayName = "";
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userData.user.id)
        .maybeSingle();
      displayName = String(prof?.display_name ?? "").trim();
    } catch {
      // ignore
    }
    if (!displayName) {
      const email = String(userData.user.email ?? "").trim();
      displayName = email.includes("@") ? email.split("@")[0] : "我";
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        author_type: "user",
        user_id: userData.user.id,
        display_name: displayName,
        parent_id: parentId,
        content,
        status: "ready",
      })
      .select("id, created_at")
      .single();

    if (error || !data) {
      console.error("[comments/create] insert error:", error);
      return fail("DB_ERROR", "发表评论失败", 502);
    }

    return ok({ id: data.id, createdAt: data.created_at }, { status: 200 });
  } catch (err: unknown) {
    console.error("[comments/create] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

