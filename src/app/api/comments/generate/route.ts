import { NextRequest, NextResponse } from "next/server";
import { extractJSON } from "@/lib/extract-json";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";
import { NPC_V2 } from "@/lib/npc/npc-v2";

const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_BASE_URL = process.env.TOKENHUB_BASE_URL ?? "https://tokenhub.tencentmaas.com";
const TOKENHUB_NPC_MODEL =
  process.env.TOKENHUB_NPC_MODEL ?? process.env.TOKENHUB_GUESS_MODEL ?? "hunyuan-2.0-instruct-20251111";
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

const SYSTEM_PROMPT = `你是「小题大Drama」的 AI 互动引擎。你将根据一条用户发布的作品（风格、情绪、主实体、场景）生成 5 条“更像真人”的评论，用于消灭“发布后社交空窗期”。

## 角色（必须遵守）
你必须生成 5 条评论，分别对应以下 5 位角色，每条都要稳定体现其表达偏好（但不要表演感过强）：
${NPC_V2.map((x, i) => `${i + 1}) ${x.displayName}（npc_id: ${x.npc_id}）：${x.stylePrompt}`).join("\n")}

## 输出格式（严格：只输出纯 JSON，不要任何解释/markdown）
{"comments":[${NPC_V2.map((x) => `{"npc_id":"${x.npc_id}","display_name":"${x.displayName}","content":"..."}`).join(",")}]}

## 内容要求
- 每条 18-55 字，中文口语化，像真实人类
- 允许并鼓励适量使用 emoji 和情绪符号（如 😂🥹✨😭🫠💀👀😍🤣💪🙈 等），也可使用“～”“…”“！”“？”等情绪标点，让表达更有温度；每条最多 1-2 个 emoji，与角色性格匹配，不要堆砌
- 不要过度浮夸，不要“夸夸群”式堆叠，不要连续多个感叹号
- 允许轻微调侃，但禁止攻击个人、羞辱、歧视、引导自残/暴力/仇恨
- 必须与输入的“主实体/场景/情绪/风格”强相关，像真的看过图一样
- 不要提到“我是AI/模型/提示词/TokenHub”等技术细节`;

export async function POST(req: NextRequest) {
  if (!TOKENHUB_API_KEY) return fail("UPSTREAM_ERROR", "服务配置异常，TOKENHUB_API_KEY 未设置", 500);

  try {
    const body = (await req.json()) as Partial<{ postId: string }>;
    const postId = String(body.postId ?? "").trim();
    if (!postId) return fail("INVALID_INPUT", "缺少 postId", 400);

    const supabase = createServerSupabaseClient();

    // 幂等：如果已经有 ready 的 NPC 评论，则直接返回
    const { data: existing } = await supabase
      .from("comments")
      .select("id, status")
      .eq("post_id", postId)
      .eq("author_type", "npc")
      .eq("status", "ready")
      .limit(1);
    if (existing && existing.length > 0) {
      return ok({ generated: false }, { status: 200 });
    }

    const { data: post, error: postErr } = await supabase
      .from("posts")
      .select("id, style, mode, result_url, main_entity, scene_state, user_emotion")
      .eq("id", postId)
      .maybeSingle();
    if (postErr || !post) return fail("NOT_FOUND", "作品不存在或读取失败", 404);

    const userContent = [
      "以下是一条作品信息（JSON），请按系统要求生成 5 条 NPC 评论：",
      JSON.stringify({
        style: post.style,
        mode: post.mode,
        mainEntity: post.main_entity,
        sceneState: post.scene_state,
        userEmotion: post.user_emotion,
      }),
    ].join("\n\n");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    const baseUrl = TOKENHUB_BASE_URL.endsWith("/")
      ? TOKENHUB_BASE_URL.slice(0, -1)
      : TOKENHUB_BASE_URL;

    const upstreamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify({
        model: TOKENHUB_NPC_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.8,
        max_tokens: 700,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => upstreamRes.statusText);
      console.error(`[comments/generate] upstream ${upstreamRes.status}:`, errText.slice(0, 300));
      return fail("UPSTREAM_ERROR", "NPC 生成失败：上游服务异常", 502);
    }

    const upstreamData = (await upstreamRes.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      error?: { message: string };
    };
    if (upstreamData.error) return fail("UPSTREAM_ERROR", `NPC 生成失败：${upstreamData.error.message}`, 502);

    const msg = upstreamData.choices?.[0]?.message;
    const rawContent = (msg?.content?.trim() || msg?.reasoning_content?.trim() || "").trim();
    if (!rawContent) return fail("UPSTREAM_ERROR", "NPC 生成失败：返回内容为空", 502);

    let parsed: {
      comments: Array<{ npc_id: string; display_name: string; content: string }>;
    };
    try {
      parsed = JSON.parse(extractJSON(rawContent)) as typeof parsed;
    } catch (e) {
      console.error("[comments/generate] parse error:", rawContent, e);
      return fail("UNEXPECTED", "NPC 生成失败：解析异常", 500);
    }

    const normalized = Array.isArray(parsed.comments) ? parsed.comments.slice(0, 5) : [];
    if (normalized.length !== 5) return fail("UNEXPECTED", "NPC 生成失败：评论数量不正确", 500);

    const rows = normalized.map((c) => ({
      post_id: postId,
      author_type: "npc" as const,
      npc_id: String(c.npc_id ?? "").trim(),
      display_name: String(c.display_name ?? "").trim(),
      content: String(c.content ?? "").trim(),
      status: "ready" as const,
    }));

    // 写入 ready 评论
    const { error: insertErr } = await supabase.from("comments").insert(rows);
    if (insertErr) {
      console.error("[comments/generate] insert error:", insertErr);
      return fail("DB_ERROR", "NPC 生成失败：写入数据库失败", 502);
    }

    // 清理 placeholder：避免“首评兜底”与真实评论重复出现
    await supabase
      .from("comments")
      .delete()
      .eq("post_id", postId)
      .eq("author_type", "npc")
      .eq("status", "placeholder");

    return ok(
      { generated: true, ...(process.env.NODE_ENV === "development" && { rawContent }) },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return fail("TIMEOUT", "NPC 生成超时，请稍后重试", 504);
    }
    console.error("[comments/generate] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "生成异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

