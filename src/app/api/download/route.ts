/**
 * /api/download — 服务端代理下载
 *
 * 前端直接 fetch 跨域 CDN 图片/视频会被 CORS 拒绝，
 * 通过此路由在服务端拉取资源并以 Content-Disposition: attachment 返回，
 * 浏览器即可触发真正的文件下载。
 *
 * GET /api/download?url=<encoded_url>&filename=<encoded_filename>
 */

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
];

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB 上限

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawUrl = searchParams.get("url") ?? "";
  const filename = searchParams.get("filename") ?? "drama-download";

  if (!rawUrl) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "url 格式无效" }, { status: 400 });
  }

  // 只允许 https，防止 SSRF
  if (url.protocol !== "https:") {
    return NextResponse.json({ error: "只允许 https URL" }, { status: 400 });
  }

  try {
    const upstream = await fetch(rawUrl, {
      headers: { "User-Agent": "XTDDrama/1.0" },
      // 30s timeout
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `上游返回 ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const baseType = contentType.split(";")[0].trim().toLowerCase();

    if (!ALLOWED_CONTENT_TYPES.some((t) => baseType.startsWith(t))) {
      return NextResponse.json(
        { error: "不支持的文件类型" },
        { status: 415 }
      );
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "文件过大" }, { status: 413 });
    }

    const safeFilename = filename.replace(/[^\w.\-]/g, "_").slice(0, 120);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": baseType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ error: "下载超时" }, { status: 504 });
    }
    console.error("[download] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "下载失败" },
      { status: 500 }
    );
  }
}
