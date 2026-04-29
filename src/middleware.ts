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
   * 对需要读取 cookie session 的受保护 API 与关键页面触发 session 刷新。
   * /me 等页面会在 Server Component 里直接调用 auth.getUser，
   * 若不经过中间件刷新 cookie，容易出现“客户端已登录、服务端判未登录”的状态分裂。
   */
  matcher: [
    "/me",
    "/settings",
    "/api/posts/create",
    "/api/posts/delete",
    "/api/profiles/me",
    "/api/profiles/upsert",
    "/api/avatars/upload",
    "/api/comments/generate",
  ],
};

