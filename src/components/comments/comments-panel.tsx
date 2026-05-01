"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toast } from "@/components/ui/toast";
import { useAuth } from "@/components/providers/auth-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { requestLogin } from "@/lib/request-login";

type CommentRow = {
  id: string;
  created_at: string;
  author_type: "npc" | "user";
  user_id: string | null;
  npc_id: string | null;
  display_name: string | null;
  parent_id: string | null;
  content: string;
  status: "ready" | "placeholder";
};

type Node = CommentRow & { children: Node[] };

// 基础时间轴加入随机抖动（±300ms），让显现更像真人
const BASE_SCHEDULE_MS = [800, 4200, 9000, 15000, 23000] as const;
const STAGED_SCHEDULE_MS = BASE_SCHEDULE_MS.map((t) =>
  t + (Math.floor(Math.random() * 600) - 300)
) as unknown as typeof BASE_SCHEDULE_MS;
const commentGenerationRequests = new Map<string, Promise<void>>();

function readStagedAt(postId: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(`xtdDrama.stagedAt.${postId}`);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

function computeVisibleByElapsed(elapsedMs: number, max: number) {
  let v = 0;
  for (let i = 0; i < STAGED_SCHEDULE_MS.length && i < max; i++) {
    if (elapsedMs >= STAGED_SCHEDULE_MS[i]) v = i + 1;
  }
  return v;
}

function buildTree(rows: CommentRow[]) {
  const map = new Map<string, Node>();
  const roots: Node[] = [];
  for (const r of rows) map.set(r.id, { ...r, children: [] });
  for (const n of map.values()) {
    const pid = n.parent_id;
    if (pid && map.has(pid)) map.get(pid)!.children.push(n);
    else roots.push(n);
  }
  const sort = (arr: Node[]) => {
    arr.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    arr.forEach((x) => sort(x.children));
  };
  sort(roots);
  return roots;
}

function generateNpcComments(postId: string) {
  const existing = commentGenerationRequests.get(postId);
  if (existing) return existing;

  const request = fetch("/api/comments/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId }),
  })
    .then(() => void 0)
    .finally(() => {
      commentGenerationRequests.delete(postId);
    });

  commentGenerationRequests.set(postId, request);
  return request;
}

export function CommentsPanel({
  postId,
  postUserId,
  openComposerOnMount = false,
  enablePolling = true,
  enableNpcAutoGenerate = true,
}: {
  postId: string;
  postUserId?: string | null;
  openComposerOnMount?: boolean;
  enablePolling?: boolean;
  enableNpcAutoGenerate?: boolean;
}) {
  const { status: authStatus, session } = useAuth();
  const myUserId = session?.user?.id ?? null;

  const [items, setItems] = useState<CommentRow[] | null>(null);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<null | { title: string; description?: string; tone?: "success" | "error" | "info"; durationMs?: number }>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const [generating, setGenerating] = useState(false);
  const generationTriggeredRef = useRef(false);
  const [npcVisibleCount, setNpcVisibleCount] = useState<number>(999);

  const url = useMemo(() => `/api/comments/list?postId=${encodeURIComponent(postId)}`, [postId]);
  const clearToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as { success: boolean; data?: CommentRow[]; error?: string };
      if (!data.success) {
        setError(data.error ?? "读取失败");
        return;
      }
      setError("");
      setItems(data.data ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, [url]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const guardedLoad = async () => {
      if (!alive) return;
      await load();
    };
    guardedLoad();

    if (!enablePolling) {
      return () => {
        alive = false;
        if (timer) clearInterval(timer);
      };
    }

    timer = setInterval(guardedLoad, 2500);
    const stop = setTimeout(() => {
      if (timer) clearInterval(timer);
    }, 25000);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      clearTimeout(stop);
    };
  }, [enablePolling, load]);

  useEffect(() => {
    const onCompose = (e: Event) => {
      const ce = e as CustomEvent<{ postId?: string }>;
      const pid = ce?.detail?.postId;
      if (!pid || pid !== postId) return;
      if (authStatus !== "authed") {
        requestLogin("登录后即可参与评论");
        return;
      }
      setComposerOpen(true);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    };
    window.addEventListener("xtdDrama:comment-compose", onCompose as EventListener);
    return () => window.removeEventListener("xtdDrama:comment-compose", onCompose as EventListener);
  }, [authStatus, postId]);

  useEffect(() => {
    if (!openComposerOnMount) return;
    const timer = window.setTimeout(() => {
      setComposerOpen(true);
      composerRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openComposerOnMount]);

  useEffect(() => {
    if (generationTriggeredRef.current) return;
    if (items === null) return;
    if (!enableNpcAutoGenerate) return;
    const hasReadyNpc = items.some((x) => x.author_type === "npc" && x.status === "ready");
    if (hasReadyNpc) return;
    generationTriggeredRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGenerating(true);
    generateNpcComments(postId)
      .then(() => load())
      .finally(() => setGenerating(false));
  }, [enableNpcAutoGenerate, items, load, postId]);

  // 25 秒内陆续显现 NPC 评论（纯表现层：按 stagedAt + elapsed 推算；用户评论不受影响）
  useEffect(() => {
    if (!items) return;
    const npcReady = items.filter((x) => x.author_type === "npc" && x.status === "ready");
    if (npcReady.length === 0) return;

    const doneKey = `xtdDrama.npcCommentsStaged.${postId}`;
    try {
      if (window.sessionStorage.getItem(doneKey) === "1") {
        Promise.resolve().then(() => setNpcVisibleCount(999));
        return;
      }
    } catch {
      // ignore
    }

    const stagedAt = readStagedAt(postId);
    if (!stagedAt) {
      Promise.resolve().then(() => setNpcVisibleCount(999));
      return;
    }

    const max = Math.min(5, npcReady.length);
    const tick = () => {
      const elapsed = Date.now() - stagedAt;
      const v = computeVisibleByElapsed(elapsed, max);
      setNpcVisibleCount(v);
      if (v >= max) {
        try {
          window.sessionStorage.setItem(doneKey, "1");
        } catch {
          // ignore
        }
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [items, postId]);

  const canDelete = useCallback(
    (c: CommentRow) => {
      if (!myUserId) return false;
      const isOwner = !!c.user_id && c.user_id === myUserId;
      const isPostOwner = !!postUserId && postUserId === myUserId;
      return isOwner || isPostOwner;
    },
    [myUserId, postUserId]
  );

  const submit = useCallback(async () => {
    if (busy) return;
    if (authStatus !== "authed") {
      setToast({ title: "请先登录", tone: "info" });
      return;
    }
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      const res = await fetch("/api/comments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string; id?: string } | null;
      if (!res.ok || !data?.success) {
        setToast({ title: "发送失败", description: data?.error ?? "请重试", tone: "error", durationMs: 3800 });
        return;
      }
      setDraft("");
      setComposerOpen(false);
      setToast({
        title: "发送成功",
        description: "你的评论已发布",
        tone: "success",
        durationMs: 3400,
      });
      if (data?.id) {
        fetch("/api/comments/ai-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, parentId: data.id }),
        }).catch(() => void 0);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }, [authStatus, busy, draft, load, postId]);

  const submitReply = useCallback(async () => {
    if (busy) return;
    if (authStatus !== "authed") {
      setToast({ title: "请先登录", tone: "info" });
      return;
    }
    if (!replyTo) return;
    const content = replyDraft.trim();
    if (!content) return;
    setBusy(true);
    try {
      const res = await fetch("/api/comments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content, parentId: replyTo }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string; id?: string } | null;
      if (!res.ok || !data?.success) {
        setToast({ title: "回复失败", description: data?.error ?? "请重试", tone: "error", durationMs: 3800 });
        return;
      }
      setReplyDraft("");
      setReplyTo(null);
      setToast({
        title: "回复成功",
        description: "你的回复已发布",
        tone: "success",
        durationMs: 3400,
      });
      if (data?.id) {
        fetch("/api/comments/ai-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, parentId: data.id }),
        }).catch(() => void 0);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }, [authStatus, busy, load, postId, replyDraft, replyTo]);

  const del = useCallback(
    async (id: string) => {
      if (busy) return;
      if (authStatus !== "authed") return;
      setConfirmDeleteId(id);
    },
    [authStatus, busy]
  );

  const doDelete = useCallback(async () => {
    const id = confirmDeleteId;
    if (!id) return;
    if (busy) return;
    if (authStatus !== "authed") return;
      setBusy(true);
      try {
        const res = await fetch("/api/comments/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!res.ok || !data?.success) {
          setToast({ title: "删除失败", description: data?.error ?? "请重试", tone: "error", durationMs: 3800 });
          return;
        }
        setToast({ title: "已删除", tone: "success" });
        await load();
      } finally {
        setBusy(false);
        setConfirmDeleteId(null);
      }
    },
    [authStatus, busy, confirmDeleteId, load]
  );

  const visibleItems = useMemo(() => {
    if (!items) return items;
    const npcReady = items
      .filter((x) => x.author_type === "npc" && x.status === "ready")
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const max = Math.min(5, npcReady.length);
    const showNpc =
      npcVisibleCount >= 999 ? npcReady : npcReady.slice(0, Math.max(0, Math.min(npcVisibleCount, max)));
    const others = items.filter((x) => !(x.author_type === "npc" && x.status === "ready"));
    return others.concat(showNpc);
  }, [items, npcVisibleCount]);

  const tree = useMemo(() => (visibleItems ? buildTree(visibleItems) : []), [visibleItems]);

  const renderNode = (n: Node, depth: number) => (
    <div key={n.id} className={depth === 0 ? "py-4 border-b border-zinc-100 dark:border-white/[0.06]" : "mt-3"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">
              {n.display_name ?? (n.author_type === "npc" ? "AI" : "用户")}
            </span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-500">
              {new Date(n.created_at).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {n.status === "placeholder" ? (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">· 正在补全</span>
            ) : null}
          </div>
          <div className="mt-1.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {n.content}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-zinc-500 dark:text-zinc-500">
            {authStatus === "authed" ? (
              <button
                type="button"
                onClick={() => {
                  setReplyTo(n.id);
                  setReplyDraft("");
                }}
                className="hover:underline"
              >
                回复
              </button>
            ) : null}
            {canDelete(n) ? (
              <button type="button" onClick={() => del(n.id)} className="hover:underline">
                删除
              </button>
            ) : null}
          </div>

          {replyTo === n.id ? (
            <div className="mt-3">
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  e.preventDefault();
                  if (!busy && replyDraft.trim()) void submitReply();
                }}
                className="w-full min-h-[72px] rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
                placeholder="写下你的回复…"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitReply}
                  disabled={busy}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-white apple-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  发送
                </button>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  disabled={busy}
                  className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-60"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

          {n.children.length > 0 ? (
            <div className={depth === 0 ? "mt-3 pl-4 border-l border-zinc-100 dark:border-white/[0.06]" : "mt-3 pl-4 border-l border-zinc-100/70 dark:border-white/[0.06]"}>
              {n.children.map((c) => renderNode(c, depth + 1))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <section className="border-t border-zinc-100 dark:border-white/[0.06] pt-6">
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="确定删除这条评论吗？"
        description="删除后不可恢复。"
        confirmText="确定删除"
        cancelText="取消"
        danger
        busy={busy}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={doDelete}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">评论</div>
        <div className="text-[12px] text-zinc-500 dark:text-zinc-500">
          {generating ? "正在补全评论…" : ""}
        </div>
      </div>

      {authStatus === "authed" ? (
        composerOpen ? (
        <div className="mt-3">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              if (!busy && draft.trim()) void submit();
            }}
            className="w-full min-h-[84px] rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
            placeholder="写下你的评论…"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-[12px] text-zinc-500 dark:text-zinc-500 tabular-nums">
              {draft.trim().length}/280
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setComposerOpen(false); setDraft(""); }}
                disabled={busy}
                className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !draft.trim()}
                className="h-8 px-3 rounded-lg text-xs font-medium text-white apple-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
          </div>
        </div>
        ) : null
      ) : (
        <button
          type="button"
          onClick={() => requestLogin("登录后即可参与评论")}
          className="mt-3 text-sm text-[color:var(--apple-blue)] hover:underline"
        >
          登录后即可参与评论与回复
        </button>
      )}

      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {error
          ? `评论加载失败：${error}`
          : items === null
            ? "评论正在赶来…"
            : items.length === 0
              ? "还没有评论。"
              : null}
      </div>

      {items && items.length > 0 ? (
        <div className="mt-4">
          {tree.map((n) => renderNode(n, 0))}
        </div>
      ) : null}
    </section>
  );
}

