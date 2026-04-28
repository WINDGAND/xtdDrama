import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<{ id: string }>;
    const id = String(body.id ?? "").trim();
    if (!id) return fail("INVALID_INPUT", "缺少 id", 400);

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) {
      console.error("[posts/delete] delete error:", error);
      return fail("DB_ERROR", "删除失败", 502);
    }
    try {
      revalidateTag("plaza-posts", "max");
      revalidateTag("me-posts", "max");
      revalidateTag("posts", "max");
      revalidatePath("/plaza");
      revalidatePath("/me");
      revalidatePath(`/posts/${id}`);
    } catch {
      // ignore
    }
    return ok({}, { status: 200 });
  } catch (err: unknown) {
    console.error("[posts/delete] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "删除异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

