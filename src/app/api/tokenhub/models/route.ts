/**
 * /api/tokenhub/models — 拉取 TokenHub 模型列表（OpenAI 兼容）
 *
 * 用途：
 *  - 解决「model not found」：让你在本地直接看到可用模型名
 *  - 从返回结果里挑一个支持图片输入的模型，填入 TOKENHUB_VISION_MODEL
 *
 * 代理到：GET https://tokenhub.tencentmaas.com/v1/models
 */

import { NextResponse } from "next/server";
import { tokenHubGet, requireTokenHubKey, type TokenHubError } from "@/lib/tokenhub";

export async function GET() {
  try {
    requireTokenHubKey();

    /**
     * 兼容兜底：
     * - 标准 OpenAI 兼容实现通常是 GET /v1/models（Base URL 不含 /v1）
     * - 有些网关会要求 GET /models（当 Base URL 已经是 .../v1）
     *
     * 我们按顺序尝试，任意成功即返回。
     */
    const tryPaths = ["/v1/models", "/models"];
    let lastError: unknown = null;

    for (const path of tryPaths) {
      try {
        const data = await tokenHubGet<unknown>(path);
        return NextResponse.json(
          { success: true, data, resolvedPath: path },
          { status: 200 }
        );
      } catch (e) {
        lastError = e;
        // 只有 404 才继续尝试下一个路径，其他错误直接抛出
        const te = e as TokenHubError;
        if (te?.status !== 404) throw e;
      }
    }

    const e = lastError as TokenHubError;
    return NextResponse.json(
      {
        success: false,
        error:
          "TokenHub 网关未暴露模型列表接口（/v1/models 与 /models 均返回 404）。请使用 /api/tokenhub/validate-model 逐个验证模型名是否可用。",
        detail: e?.message ?? "404",
      },
      { status: 404 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("TOKENHUB_API_KEY")) {
      return NextResponse.json(
        { success: false, error: "服务配置异常，API Key 未设置" },
        { status: 500 }
      );
    }
    const e = err as TokenHubError;
    return NextResponse.json(
      { success: false, error: e?.message ?? "拉取模型列表失败" },
      { status: e?.status ?? 502 }
    );
  }
}

