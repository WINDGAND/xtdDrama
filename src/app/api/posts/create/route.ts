import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { VisionAnalysis } from "@/types/vision";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<{
      resultUrl: string;
      mode: "image" | "video";
      style: string;
      analysis: VisionAnalysis | null;
    }>;

    const resultUrl = String(body.resultUrl ?? "").trim();
    const mode = body.mode === "video" ? "video" : "image";
    const style = String(body.style ?? "").trim();

    if (!resultUrl) return fail("INVALID_INPUT", "缺少 resultUrl", 400);
    if (!style) return fail("INVALID_INPUT", "缺少 style", 400);

    const supabase = createServerSupabaseClient();
    const analysis = body.analysis ?? null;

    const { data, error } = await supabase
      .from("posts")
      .insert({
        mode,
        style,
        result_url: resultUrl,
        main_entity: analysis?.mainEntity ?? null,
        scene_state: analysis?.sceneState ?? null,
        user_emotion: analysis?.userEmotion ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[posts/create] insert error:", error);
      return fail(
        "DB_ERROR",
        "发布失败：请先在 Supabase 执行 supabase-schema.sql 创建 posts 表",
        502
      );
    }

    // NPC 5 秒内首评兜底：先写入一条 placeholder 评论，保证详情页立刻可见
    const fallbackContent = [
      "我懂你这波。",
      "先别硬撑，给你安排一张更离谱的。",
    ].join(" ");
    const { error: commentError } = await supabase.from("comments").insert({
      post_id: data.id,
      author_type: "npc",
      npc_id: "sis",
      display_name: "知心学姐",
      content: fallbackContent,
      status: "placeholder",
    });
    if (commentError) {
      // 不影响发布主流程：评论表可能尚未建好
      console.warn("[posts/create] insert fallback comment failed:", commentError);
    }

    return ok({ id: data.id }, { status: 200 });
  } catch (err: unknown) {
    console.error("[posts/create] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "发布异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

