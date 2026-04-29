/**
 * /api/storage/upload — 图片 base64 上传到 Supabase Storage
 *
 * 职责：
 *   - 接收前端传来的 base64 Data URL（JPG/PNG）
 *   - 将其解码为 Buffer，上传到 Supabase Storage（公开桶）
 *   - 返回可公网访问的 publicUrl（用于 HY-Image/HY-Video 的 images[]）
 *
 * 请求体：
 *   { "imageBase64": "data:image/jpeg;base64,..." }
 *
 * 成功响应：
 *   { "success": true, "publicUrl": "https://xxx.supabase.co/storage/v1/object/public/..." }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, STORAGE_BUCKET } from "@/lib/supabase-server";

interface UploadRequestBody {
  imageBase64: string;
  /** 可选：自定义文件名前缀 */
  filename?: string;
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** 从 Data URL 解析 mime type 和 Buffer */
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer; ext: string } | null {
  const match = dataUrl.match(/^data:(image\/(jpeg|png|jpg|webp));base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const ext = match[2] === "jpeg" ? "jpg" : match[2];
  const buffer = Buffer.from(match[3], "base64");
  return { mime, buffer, ext };
}

async function verifyPublicUrl(url: string) {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Range: "bytes=0-1" },
  });
  if (!res.ok) {
    throw new Error(`稳定链接校验失败：${res.status}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<UploadRequestBody>;
    const { imageBase64, filename } = body;

    if (!imageBase64) {
      return fail("缺少 imageBase64", 400);
    }

    const parsed = parseDataUrl(imageBase64);
    if (!parsed) {
      return fail("imageBase64 格式不合法，仅支持 JPG/PNG 的 Data URL", 400);
    }

    const supabase = createServerSupabaseClient();

    // 生成唯一文件名：前缀_时间戳_随机字符.ext
    const prefix = filename?.replace(/[^a-zA-Z0-9_-]/g, "") || "upload";
    const uid = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`;
    const storagePath = `user-uploads/${uid}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, parsed.buffer, {
        contentType: parsed.mime,
        upsert: false,
      });

    if (uploadError) {
      console.error("[storage/upload] Supabase 上传失败：", uploadError);
      return fail(`Supabase Storage 上传失败：${uploadError.message}`, 502);
    }

    // 获取公网 URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      return fail("获取 publicUrl 失败", 502);
    }
    try {
      await verifyPublicUrl(publicUrl);
    } catch (e) {
      console.error("[storage/upload] publicUrl verify failed:", e);
      return fail("上传已完成但链接暂不可访问，请重试", 502);
    }

    return NextResponse.json(
      { success: true, publicUrl, storagePath },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "上传异常";
    console.error("[storage/upload] 异常：", err);
    return fail(msg, 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}
