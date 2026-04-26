/**
 * /api/tokenhub/validate-model — 验证某个 model 是否存在/可调用
 *
 * 因为部分 TokenHub 网关不提供 GET /models，所以需要一个“探测器”：
 *   - 输入 model
 *   - 代理请求 POST /v1/chat/completions
 *   - 返回 success / error（尤其是 model not found）
 *
 * 请求体：
 *   { "model": "deepseek-v3" }
 */

import { NextRequest, NextResponse } from "next/server";

const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL =
  process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";

const TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

export async function POST(req: NextRequest) {
  if (!TOKENHUB_API_KEY) {
    return NextResponse.json(
      { success: false, error: "服务配置异常，API Key 未设置" },
      { status: 500 }
    );
  }

  const { model } = (await req.json().catch(() => ({}))) as { model?: string };
  const trimmedModel = model?.trim();
  if (!trimmedModel) {
    return NextResponse.json(
      { success: false, error: "缺少 model" },
      { status: 400 }
    );
  }

  const baseUrl = TOKENHUB_BASE_URL.endsWith("/")
    ? TOKENHUB_BASE_URL.slice(0, -1)
    : TOKENHUB_BASE_URL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
      },
      body: JSON.stringify({
        model: trimmedModel,
        stream: false,
        max_tokens: 32,
        temperature: 0,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      // keep as text
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          model: trimmedModel,
          status: res.status,
          error: payload,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        model: trimmedModel,
        status: res.status,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { success: false, model: trimmedModel, error: "请求超时" },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { success: false, model: trimmedModel, error: "请求失败" },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

