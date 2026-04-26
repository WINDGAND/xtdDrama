/**
 * supabase-server.ts — 服务端 Supabase client（使用 service_role key）
 *
 * 仅在 Next.js Server Components / Route Handlers 中使用。
 * service_role key 拥有完整 Storage 写权限，绝不暴露到客户端 bundle。
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Storage / Auth 需要 project 根 URL（如 https://xxx.supabase.co）。
 * 常见误配：把「REST」地址整段粘贴进 SUPABASE_URL（含 /rest/v1/），会导致 Storage 请求报 Invalid path。
 */
export function normalizeSupabaseUrl(raw: string): string {
  let u = raw.trim();
  while (u.endsWith("/")) {
    u = u.slice(0, -1);
  }
  const lower = u.toLowerCase();
  const restIdx = lower.indexOf("/rest/v1");
  if (restIdx !== -1) {
    u = u.slice(0, restIdx);
  }
  while (u.endsWith("/")) {
    u = u.slice(0, -1);
  }
  return u;
}

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

/** 创建一个具有 service_role 权限的 Supabase 客户端 */
export function createServerSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase 环境变量未配置：请在 .env.local 中设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export const STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "xtd-drama";
