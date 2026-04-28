"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NPC_V2 } from "@/lib/npc/npc-v2";
import { useAuth } from "@/components/providers/auth-provider";
import { Toast } from "@/components/ui/toast";
import { requestLogin } from "@/lib/request-login";
import ProfilePic1 from "@/../images/ProfilePic1.jpg";
import ProfilePic2 from "@/../images/ProfilePic2.jpg";
import ProfilePic3 from "@/../images/ProfilePic3.jpg";
import ProfilePic4 from "@/../images/ProfilePic4.jpg";
import ProfilePic5 from "@/../images/ProfilePic5.jpg";

const NPC_AVATAR_MAP: Record<string, { src: string }> = {
  emma: { src: (ProfilePic1 as unknown as { src: string }).src ?? String(ProfilePic1) },
  liam: { src: (ProfilePic2 as unknown as { src: string }).src ?? String(ProfilePic2) },
  olivia: { src: (ProfilePic3 as unknown as { src: string }).src ?? String(ProfilePic3) },
  noah: { src: (ProfilePic4 as unknown as { src: string }).src ?? String(ProfilePic4) },
  sophia: { src: (ProfilePic5 as unknown as { src: string }).src ?? String(ProfilePic5) },
};

export type LikeRow = {
  id: string;
  created_at: string;
  actor_type: "npc" | "user";
  user_id?: string | null;
  npc_id: string | null;
  display_name: string | null;
};

const STAGED_SCHEDULE_MS = [800, 4200, 9000, 15000, 23000] as const;
const profileAvatarCache = new Map<string, string>();
const profileAvatarRequests = new Map<string, Promise<string>>();

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

async function loadMyAvatarUrl(userId: string): Promise<string> {
  const cached = profileAvatarCache.get(userId);
  if (cached !== undefined) return cached;

  const existing = profileAvatarRequests.get(userId);
  if (existing) return existing;

  const request = fetch("/api/profiles/me")
    .then((r) => r.json().catch(() => null))
    .then((payload) => {
      const p = payload as { success?: boolean; avatarUrl?: string } | null | undefined;
      const url = p?.success ? String(p.avatarUrl ?? "") : "";
      profileAvatarCache.set(userId, url);
      try {
        const cacheKey = `xtdDrama.profile.${userId}`;
        const raw = window.sessionStorage.getItem(cacheKey);
        const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        window.sessionStorage.setItem(cacheKey, JSON.stringify({ ...prev, avatarUrl: url }));
      } catch {
        // ignore
      }
      return url;
    })
    .finally(() => {
      profileAvatarRequests.delete(userId);
    });

  profileAvatarRequests.set(userId, request);
  return request;
}

export function LikeBar({
  postId,
  initialItems,
  autoGenerate = true,
}: {
  postId: string;
  initialItems?: LikeRow[];
  autoGenerate?: boolean;
}) {
  const { status: authStatus, session } = useAuth();
  const [items, setItems] = useState<LikeRow[] | null>(initialItems ?? null);
  const [visibleCount, setVisibleCount] = useState(0);
  const generatingRef = useRef(false);
  const [toggling, setToggling] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string>("");
  const [toast, setToast] = useState<null | { title: string; description?: string; tone?: "success" | "error" | "info"; durationMs?: number }>(null);

  const url = useMemo(() => `/api/likes/list?postId=${encodeURIComponent(postId)}`, [postId]);
  const myUserId = session?.user?.id ?? null;
  const userLike = myUserId
    ? items?.find((x) => x.actor_type === "user" && x.user_id === myUserId)
    : undefined;
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (authStatus !== "authed" || !myUserId || !userLike) {
      Promise.resolve().then(() => setMyAvatarUrl(""));
      return;
    }

    const cacheKey = `xtdDrama.profile.${myUserId}`;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { avatarUrl?: unknown };
        const url = typeof cached.avatarUrl === "string" ? cached.avatarUrl : "";
        if (url) {
          Promise.resolve().then(() => setMyAvatarUrl(url));
          return;
        }
      }
    } catch {
      // ignore
    }

    let alive = true;
    loadMyAvatarUrl(myUserId)
      .then((url) => {
        if (!alive) return;
        setMyAvatarUrl(url);
      })
      .catch(() => void 0);

    return () => {
      alive = false;
    };
  }, [authStatus, myUserId, userLike]);

  const load = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as { success: boolean; data?: LikeRow[] };
    if (!data?.success) {
      setItems([]);
      return;
    }
    setItems(Array.isArray(data.data) ? data.data : []);
  }, [url]);

  // 首次无数据则触发 NPC 点赞生成（幂等）
  useEffect(() => {
    if (items === null) return;
    // 关键：即使用户先点赞，items 也会有 user like，但仍需要生成 NPC likes
    if (items.some((x) => x.actor_type === "npc")) return;
    if (generatingRef.current) return;
    if (!autoGenerate && !readStagedAt(postId)) return;
    generatingRef.current = true;
    fetch("/api/likes/npc-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    }).finally(() => {
      load().finally(() => {
        generatingRef.current = false;
      });
    });
  }, [autoGenerate, items, load, postId]);

  useEffect(() => {
    if (initialItems) return;
    Promise.resolve()
      .then(() => load())
      .catch(() => Promise.resolve().then(() => setItems([])));
  }, [initialItems, load]);

  useEffect(() => {
    const onUpdated = (e: Event) => {
      const ce = e as CustomEvent<{ postId?: string }>;
      const next = ce?.detail?.postId;
      if (!next || next === postId) {
        Promise.resolve().then(() => load()).catch(() => void 0);
      }
    };
    window.addEventListener("xtdDrama:likes-updated", onUpdated as EventListener);
    return () => window.removeEventListener("xtdDrama:likes-updated", onUpdated as EventListener);
  }, [load, postId]);

  // 25 秒内陆续显现（纯表现层：按 stagedAt + elapsed 推算，避免被 reload/点赞操作重置）
  useEffect(() => {
    if (!items) return;
    const npcLikes = items.filter((x) => x.actor_type === "npc");
    if (npcLikes.length === 0) return;

    const doneKey = `xtdDrama.npcLikesStaged.${postId}`;
    try {
      if (window.sessionStorage.getItem(doneKey) === "1") {
        Promise.resolve().then(() => setVisibleCount(999));
        return;
      }
    } catch {
      // ignore
    }

    const stagedAt = readStagedAt(postId);
    if (!stagedAt) {
      // 没有时间轴（历史帖子/异常场景）直接全量展示，避免“突然从 0 开始”
      Promise.resolve().then(() => setVisibleCount(999));
      return;
    }

    const max = Math.min(5, npcLikes.length);
    const tick = () => {
      const elapsed = Date.now() - stagedAt;
      const v = computeVisibleByElapsed(elapsed, max);
      setVisibleCount(v);
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

  const onToggleLike = useCallback(async () => {
    if (authStatus !== "authed" || !session?.user?.id) {
      requestLogin("登录后即可点赞");
      return;
    }
    if (toggling) return;
    setToggling(true);
    try {
      const res = await fetch("/api/likes/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; liked?: boolean } | null;
      if (!res.ok || !data?.success) {
        setToast({ title: "操作失败", description: "请重试", tone: "error", durationMs: 3800 });
        return;
      }
      const liked = !!data.liked;
      setToast({ title: liked ? "已赞" : "已取消赞", tone: "success" });
      setItems((prev) => {
        if (!prev) return prev;
        const uid = session.user.id;
        const filtered = prev.filter((x) => !(x.actor_type === "user" && x.user_id === uid));
        if (!liked) return filtered;
        return filtered.concat([
          {
            id: `user_${uid}`,
            created_at: new Date().toISOString(),
            actor_type: "user",
            user_id: uid,
            npc_id: null,
            display_name: "我",
          },
        ]);
      });
    } finally {
      setToggling(false);
    }
  }, [authStatus, postId, session, toggling]);

  if (items === null) return null;

  const npcLikes = items.filter((x) => x.actor_type === "npc");
  const visibleLikes = visibleCount >= 999 ? npcLikes : npcLikes.slice(0, visibleCount);
  const showMyAvatar = !!userLike;

  return (
    <div className="mt-2 flex items-center gap-3">
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLike}
          disabled={authStatus !== "authed" || toggling}
          className={[
            "h-8 w-8 grid place-items-center rounded-lg transition-colors",
            "hover:bg-zinc-100/70 dark:hover:bg-white/[0.06]",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)]",
          ].join(" ")}
          aria-label={userLike ? "取消点赞" : "点赞"}
          title={userLike ? "取消点赞" : "点赞"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={userLike ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={userLike ? "text-rose-500" : "text-zinc-500 dark:text-zinc-500"}
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-8.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5">
          {visibleLikes.slice(0, 5).map((x) => {
            const cfg = NPC_V2.find((n) => n.npc_id === x.npc_id);
            const cls = cfg?.avatarPlaceholder.cls ?? "bg-zinc-200/70 dark:bg-white/[0.10] ring-zinc-200/70 dark:ring-white/[0.12]";
            const avatar = x.npc_id ? NPC_AVATAR_MAP[x.npc_id] : null;
            return (
              <span key={x.id} className="h-6 w-6 rounded-lg overflow-hidden" title={x.display_name ?? "AI"}>
                {avatar?.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar.src}
                    alt={x.display_name ?? "AI"}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover rounded-lg border border-zinc-200/40 dark:border-white/[0.08]"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={[
                      "block h-full w-full rounded-lg",
                      "ring-1 border border-zinc-200/40 dark:border-white/[0.08]",
                      cls,
                    ].join(" ")}
                  />
                )}
              </span>
            );
          })}
          {showMyAvatar ? (
            <span className="h-6 w-6 rounded-lg overflow-hidden" title="我" aria-hidden="true">
              {myAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={myAvatarUrl}
                  alt="我"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover rounded-lg border border-zinc-200/40 dark:border-white/[0.08]"
                />
              ) : (
                <span className="h-6 w-6 rounded-lg overflow-hidden border border-zinc-200/40 dark:border-white/[0.08] bg-zinc-100 dark:bg-white/[0.06] text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 grid place-items-center">
                  我
                </span>
              )}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

