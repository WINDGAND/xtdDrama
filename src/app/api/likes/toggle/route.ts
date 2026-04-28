import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthServerClient();
    const { data: userData, error: userErr } = await auth.auth.getUser();
    if (userErr || !userData.user) return fail("INVALID_INPUT", "请先登录", 401);

    const body = (await req.json()) as Partial<{ postId: string }>;
    const postId = String(body.postId ?? "").trim();
    if (!postId) return fail("INVALID_INPUT", "缺少 postId", 400);

    const supabase = createServerSupabaseClient();
    const userId = userData.user.id;

    const { data: existing, error: exErr } = await supabase
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("actor_type", "user")
      .eq("user_id", userId)
      .limit(1);

    if (exErr) {
      console.error("[likes/toggle] select error:", exErr);
      return fail("DB_ERROR", "点赞失败", 502);
    }

    if (existing && existing.length > 0) {
      const { error: delErr } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("actor_type", "user")
        .eq("user_id", userId);
      if (delErr) {
        console.error("[likes/toggle] delete error:", delErr);
        return fail("DB_ERROR", "取消点赞失败", 502);
      }
      return ok({ liked: false }, { status: 200 });
    }

    const { error: insErr } = await supabase.from("post_likes").insert({
      post_id: postId,
      actor_type: "user",
      user_id: userId,
      display_name: userData.user.email ?? null,
    });
    if (insErr) {
      console.error("[likes/toggle] insert error:", insErr);
      return fail("DB_ERROR", "点赞失败", 502);
    }

    return ok({ liked: true }, { status: 200 });
  } catch (err: unknown) {
    console.error("[likes/toggle] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

