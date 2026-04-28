import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { fail, ok } from "@/lib/api-response";

export async function GET() {
  try {
    const auth = await createAuthServerClient();
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return fail("INVALID_INPUT", "请先登录", 401);

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (error) {
      console.error("[profiles/me] select error:", error);
      return fail("DB_ERROR", "读取失败", 502);
    }

    return ok({
      displayName: data?.display_name ?? "",
      avatarUrl: data?.avatar_url ?? "",
    });
  } catch (err: unknown) {
    console.error("[profiles/me] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "读取异常", 500);
  }
}

