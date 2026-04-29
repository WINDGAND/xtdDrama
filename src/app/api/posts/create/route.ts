import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createServerSupabaseClient, STORAGE_BUCKET } from "@/lib/supabase-server";
import type { VisionAnalysis } from "@/types/vision";
import { fail, ok } from "@/lib/api-response";
import { createAuthServerClient } from "@/lib/supabase-auth-server";

function isStableStorageUrl(url: string) {
  // public object url pattern: /storage/v1/object/public/<bucket>/<path>
  return url.includes("/storage/v1/object/public/");
}

function guessExtFromContentType(ct: string | null | undefined) {
  const v = String(ct ?? "").toLowerCase();
  if (v.includes("image/webp")) return "webp";
  if (v.includes("image/png")) return "png";
  if (v.includes("image/jpeg") || v.includes("image/jpg")) return "jpg";
  if (v.includes("video/mp4")) return "mp4";
  return "bin";
}

async function fetchWithRetry(input: string, init: RequestInit, retry = 2): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i <= retry; i++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
      if (i >= retry) return res;
    } catch (e) {
      lastErr = e;
      if (i >= retry) throw e;
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error("request_failed");
}

async function verifyPublicUrl(url: string) {
  const res = await fetchWithRetry(
    url,
    {
      method: "GET",
      cache: "no-store",
      headers: { Range: "bytes=0-1" },
    },
    1
  );
  if (!res.ok) {
    throw new Error(`稳定链接校验失败：${res.status}`);
  }
}

async function mirrorToStorage(supabase: ReturnType<typeof createServerSupabaseClient>, inputUrl: string, userId: string) {
  const res = await fetchWithRetry(inputUrl, { cache: "no-store" }, 2);
  if (!res.ok) {
    throw new Error(`拉取生成结果失败：${res.status}`);
  }
  const ct = res.headers.get("content-type");
  const ab = await res.arrayBuffer();
  const maxBytes = 25 * 1024 * 1024;
  if (ab.byteLength <= 0) throw new Error("生成结果为空");
  if (ab.byteLength > maxBytes) throw new Error("生成结果过大，无法发布");

  const ext = guessExtFromContentType(ct);
  const uid = `result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `posts/${userId}/${uid}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, Buffer.from(ab), {
      contentType: ct ?? undefined,
      upsert: false,
    });
  if (uploadError) throw new Error(`存储失败：${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) throw new Error("获取 publicUrl 失败");
  await verifyPublicUrl(publicUrl);
  return publicUrl;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await createAuthServerClient();
    const { data: userData, error: userErr } = await auth.auth.getUser();
    if (userErr || !userData.user) {
      return fail("INVALID_INPUT", "请先登录再发布", 401);
    }

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

    // 关键：模型侧 resultUrl 可能是临时链接（过期后广场无法显示），发布时统一落盘到 Supabase Storage。
    let stableResultUrl = resultUrl;
    if (!isStableStorageUrl(resultUrl)) {
      try {
        stableResultUrl = await mirrorToStorage(supabase, resultUrl, userData.user.id);
      } catch (e) {
        console.error("[posts/create] mirror failed:", e);
        return fail("UPSTREAM_ERROR", "生成结果链接已失效或不可用，请重新生成后再发布", 502);
      }
    } else {
      try {
        await verifyPublicUrl(stableResultUrl);
      } catch (e) {
        console.error("[posts/create] verify stable url failed:", e);
        return fail("UPSTREAM_ERROR", "当前图片链接暂不可访问，请稍后重试发布", 502);
      }
    }

    const { data, error } = await supabase
      .from("posts")
      .insert({
        mode,
        style,
        result_url: stableResultUrl,
        user_id: userData.user.id,
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

    // 互动兜底：不再写死旧 NPC 名字/人设；首屏由前端展示“正在赶来…”
    // 点赞/评论由独立的生成流程补齐（并在前端做 25 秒内陆续显现）

    try {
      revalidateTag("plaza-posts", "max");
      revalidateTag("me-posts", "max");
      revalidateTag("posts", "max");
      revalidatePath("/plaza");
      revalidatePath("/me");
      revalidatePath(`/posts/${data.id}`);
    } catch {
      // 缓存失效失败不阻断发布
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

