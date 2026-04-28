import { normalizeSupabaseUrl } from "@/lib/supabase-server";

/** 为 Supabase 预解析 DNS / TLS，加速首次鉴权与 Storage 请求 */
export function SupabaseOriginHints() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  let origin = "";
  try {
    const base = normalizeSupabaseUrl(raw);
    origin = new URL(base).origin;
  } catch {
    origin = "";
  }
  if (!origin) return null;

  return (
    <>
      <link rel="dns-prefetch" href={origin} />
      <link rel="preconnect" href={origin} crossOrigin="anonymous" />
    </>
  );
}
