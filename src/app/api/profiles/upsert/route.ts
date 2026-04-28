import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { fail, ok } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthServerClient();
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return fail("INVALID_INPUT", "请先登录", 401);

    const body = (await req.json()) as Partial<{ displayName: string; avatarUrl: string }>;
    const displayNameRaw = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const displayName = displayNameRaw.slice(0, 12);
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userData.user.id,
        display_name: displayName || null,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("[profiles/upsert] upsert error:", error);
      return fail("DB_ERROR", "保存失败", 502);
    }

    return ok({}, { status: 200 });
  } catch (err: unknown) {
    console.error("[profiles/upsert] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "保存异常", 500);
  }
}

