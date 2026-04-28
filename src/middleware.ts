import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!supabaseUrl || !supabaseAnonKey) return res;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // 触发 session 刷新（如需）
  await supabase.auth.getUser();

  return res;
}

export const config = {
  /**
   * 仅对需要读取 cookie session 的受保护 API 触发 session 刷新。
   * 页面导航与 RSC 请求不再经过中间件，避免每次切页 await getUser 造成卡顿。
   */
  matcher: [
    "/api/posts/create",
    "/api/posts/delete",
    "/api/profiles/me",
    "/api/profiles/upsert",
    "/api/avatars/upload",
    "/api/comments/generate",
  ],
};

