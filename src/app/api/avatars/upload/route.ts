import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAuthServerClient } from "@/lib/supabase-auth-server";
import { fail, ok } from "@/lib/api-response";

const AVATAR_BUCKET = process.env.SUPABASE_AVATAR_BUCKET ?? "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer; ext: string } | null {
  const match = dataUrl.match(/^data:(image\/(jpeg|png|jpg|webp));base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const ext = match[2] === "jpeg" ? "jpg" : match[2];
  const buffer = Buffer.from(match[3], "base64");
  return { mime, buffer, ext };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthServerClient();
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return fail("INVALID_INPUT", "请先登录", 401);

    const body = (await req.json()) as Partial<{ imageBase64: string }>;
    const imageBase64 = String(body.imageBase64 ?? "").trim();
    const parsed = parseDataUrl(imageBase64);
    if (!parsed) return fail("INVALID_INPUT", "仅支持 JPG/PNG/WebP 的 base64 Data URL", 400);
    if (parsed.buffer.byteLength > MAX_AVATAR_BYTES) {
      return fail("INVALID_INPUT", "头像图片过大（最大 2MB）", 413);
    }

    const supabase = createServerSupabaseClient();
    const path = `avatars/${userData.user.id}.${parsed.ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, parsed.buffer, { contentType: parsed.mime, upsert: true });
    if (uploadErr) {
      console.error("[avatars/upload] upload error:", uploadErr);
      return fail("DB_ERROR", `头像上传失败：${uploadErr.message}`, 502);
    }

    const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) return fail("UNEXPECTED", "获取头像链接失败", 500);

    return ok({ publicUrl }, { status: 200 });
  } catch (err: unknown) {
    console.error("[avatars/upload] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "上传异常", 500);
  }
}

