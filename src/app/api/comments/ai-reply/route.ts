import { NextRequest, NextResponse } from "next/server";
import { extractJSON } from "@/lib/extract-json";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fail, ok } from "@/lib/api-response";
import { NPC_V2 } from "@/lib/npc/npc-v2";
import { tokenHubChatCompletionsUrl } from "@/lib/tokenhub";

const TOKENHUB_API_KEY = process.env.TOKENHUB_API_KEY ?? "";
const TOKENHUB_NPC_MODEL =
  process.env.TOKENHUB_NPC_MODEL ?? process.env.TOKENHUB_GUESS_MODEL ?? "hunyuan-2.0-instruct-20251111";
const UPSTREAM_TIMEOUT_MS = Number(process.env.TOKENHUB_TIMEOUT_MS ?? "30000");

function pickNpcs(seed: string) {
  // 稳定但简单：按 seed hash 轮转取 2 个
  const h = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const a = NPC_V2[h % NPC_V2.length];
  const b = NPC_V2[(h + 2) % NPC_V2.length];
  return [a, b];
}

function pickSecondNpc(seed: string, firstNpcId: string) {
  const pool = NPC_V2.filter((x) => x.npc_id !== firstNpcId);
  if (pool.length === 0) return NPC_V2[0];
  const h = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return pool[h % pool.length];
}

export async function POST(req: NextRequest) {
  if (!TOKENHUB_API_KEY) return fail("UPSTREAM_ERROR", "服务配置异常，TOKENHUB_API_KEY 未设置", 500);

  try {
    const body = (await req.json()) as Partial<{ postId: string; parentId: string }>;
    const postId = String(body.postId ?? "").trim();
    const parentId = String(body.parentId ?? "").trim();
    if (!postId) return fail("INVALID_INPUT", "缺少 postId", 400);
    if (!parentId) return fail("INVALID_INPUT", "缺少 parentId", 400);

    const supabase = createServerSupabaseClient();

    // parent comment
    const { data: parent, error: pErr } = await supabase
      .from("comments")
      .select("id, post_id, content, author_type, user_id, npc_id")
      .eq("id", parentId)
      .maybeSingle();
    if (pErr || !parent) return fail("NOT_FOUND", "评论不存在", 404);
    if (String(parent.post_id) !== postId) return fail("INVALID_INPUT", "评论与作品不匹配", 400);

    // 幂等：已有 npc 回复则不重复生成（同 parentId）
    const { data: existing } = await supabase
      .from("comments")
      .select("id")
      .eq("post_id", postId)
      .eq("author_type", "npc")
      .eq("parent_id", parentId)
      .limit(1);
    if (existing && existing.length > 0) return ok({ generated: false }, { status: 200 });

    // 选人规则：
    // - 如果用户回复的是某位 AI（parent.author_type === 'npc'），则优先由该 AI 接话
    // - 第二位从剩余 AI 中按稳定规则挑选（补刀/共情）
    // - 如果回复目标不是 AI，则按 seed 稳定挑 2 位
    const first =
      parent.author_type === "npc" && typeof parent.npc_id === "string" && parent.npc_id
        ? NPC_V2.find((x) => x.npc_id === parent.npc_id) ?? null
        : null;
    const npcs = first
      ? [first, pickSecondNpc(parentId, first.npc_id)]
      : pickNpcs(parentId);

    // 获取帖子上下文，给 AI 回复提供完整语境
    const { data: post } = await supabase
      .from("posts")
      .select("id, style, main_entity, scene_state, user_emotion")
      .eq("id", postId)
      .maybeSingle();

    const system = `你是「小题大Drama」的互动回复引擎。现在需要你以指定角色身份，回复用户的一条评论。要求：更像真实人类表达、不浮夸、不连续多个感叹号。每条 12-45 字，中文口语化。允许并鼓励适量使用 emoji 和情绪符号（如 😂🥹✨😭 等）及“～”“…”“！”“？”等情绪标点，每条最多 1-2 个，与角色性格匹配，不要堆砌。你必须紧扣作品的主实体/场景/情绪/风格回复，像真的看过图一样，不要脱离原帖语境。\n\n你必须输出纯 JSON：{"replies":[{"npc_id":"...","display_name":"...","content":"..."}]}\n只输出 JSON。`;
    const user = [
      "这是一条用户评论，请给出 2 条 AI 角色回复（不同角色）：",
      "该评论所属作品信息（必须紧扣这些内容回复）：",
      `主实体: ${String(post?.main_entity ?? "").trim()}`,
      `场景: ${String(post?.scene_state ?? "").trim()}`,
      `情绪: ${String(post?.user_emotion ?? "").trim()}`,
      `风格: ${String(post?.style ?? "").trim()}`,
      `comment: ${String(parent.content ?? "").trim()}`,
      "角色与风格：",
      ...npcs.map((x) => `- ${x.displayName}（npc_id: ${x.npc_id}）：${x.stylePrompt}`),
    ].join("\n");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    const upstreamRes = await fetch(tokenHubChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKENHUB_API_KEY}`,
        "User-Agent": "XTDDrama/1.0",
      },
      body: JSON.stringify({
        model: TOKENHUB_NPC_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 500,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => upstreamRes.statusText);
      console.error(`[comments/ai-reply] upstream ${upstreamRes.status}:`, errText.slice(0, 300));
      return fail("UPSTREAM_ERROR", "回复生成失败：上游服务异常", 502);
    }

    const upstreamData = (await upstreamRes.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      error?: { message: string };
    };
    if (upstreamData.error) return fail("UPSTREAM_ERROR", `回复生成失败：${upstreamData.error.message}`, 502);

    const msg = upstreamData.choices?.[0]?.message;
    const rawContent = (msg?.content?.trim() || msg?.reasoning_content?.trim() || "").trim();
    if (!rawContent) return fail("UPSTREAM_ERROR", "回复生成失败：返回内容为空", 502);

    let parsed: { replies: Array<{ npc_id: string; display_name: string; content: string }> };
    try {
      parsed = JSON.parse(extractJSON(rawContent)) as typeof parsed;
    } catch (e) {
      console.error("[comments/ai-reply] parse error:", rawContent, e);
      return fail("UNEXPECTED", "回复生成失败：解析异常", 500);
    }

    const replies = Array.isArray(parsed.replies) ? parsed.replies.slice(0, 2) : [];
    if (replies.length < 1) return fail("UNEXPECTED", "回复生成失败：数量不正确", 500);

    const rows = replies.map((r) => ({
      post_id: postId,
      author_type: "npc" as const,
      npc_id: String(r.npc_id ?? "").trim(),
      display_name: String(r.display_name ?? "").trim(),
      parent_id: parentId,
      content: String(r.content ?? "").trim(),
      status: "ready" as const,
    }));

    const { error: insErr } = await supabase.from("comments").insert(rows);
    if (insErr) {
      console.error("[comments/ai-reply] insert error:", insErr);
      return fail("DB_ERROR", "回复生成失败：写入失败", 502);
    }

    return ok({ generated: true }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return fail("TIMEOUT", "回复生成超时，请稍后重试", 504);
    }
    console.error("[comments/ai-reply] exception:", err);
    return fail("UNEXPECTED", err instanceof Error ? err.message : "异常", 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "方法不允许，请使用 POST" }, { status: 405 });
}

