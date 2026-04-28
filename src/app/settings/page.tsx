"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { requestLoginDirect } from "@/lib/request-login";
import { useAuth } from "@/components/providers/auth-provider";
import { Toast } from "@/components/ui/toast";
import { InlineAlert } from "@/components/ui/inline-alert";

const MAX_NICKNAME_LEN = 12;
const PROFILE_CACHE_PREFIX = "xtdDrama.profile.";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_AVATAR_DIM = 1024;

export default function SettingsPage() {
  useTheme();
  const { status: authStatus, session } = useAuth();
  const [toast, setToast] = useState<null | { title: string; description?: string; tone?: "success" | "error" | "info"; durationMs?: number }>(null);
  const [email, setEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const newPasswordRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const authed = authStatus === "loading" ? null : authStatus === "authed";

  useEffect(() => {
    if (authStatus === "loading") return;
    Promise.resolve().then(() => setEmail(session?.user?.email ?? ""));
    if (!session) {
      Promise.resolve().then(() => {
        setProfileLoading(false);
        setDisplayName("");
        setAvatarUrl("");
        setNameDraft("");
        setEditingName(false);
      });
      return;
    }

    const userId = session.user?.id;
    const cacheKey = userId ? `${PROFILE_CACHE_PREFIX}${userId}` : "";
    let cacheHit = false;
    if (cacheKey) {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as { displayName?: unknown; avatarUrl?: unknown };
          const cachedName = typeof cached.displayName === "string" ? cached.displayName : "";
          const cachedAvatar = typeof cached.avatarUrl === "string" ? cached.avatarUrl : "";
          cacheHit = true;
          Promise.resolve().then(() => {
            setProfileLoading(false);
            setDisplayName(cachedName);
            setAvatarUrl(cachedAvatar);
            setNameDraft(cachedName);
          });
        }
      } catch {
        // ignore cache
      }
    }

    let alive = true;
    Promise.resolve().then(() => {
      // 有缓存就不展示 skeleton；无缓存再进入 loading
      if (!cacheHit) setProfileLoading(true);
      setChangingPassword(false);
      setConfirmPassword("");
      setNewPassword("");
    });

    fetch("/api/profiles/me")
      .then((r) => r.json().catch(() => null))
      .then((payload) => {
        if (!alive) return;
        const p = payload as
          | { success?: boolean; displayName?: string; avatarUrl?: string }
          | null
          | undefined;
        setProfileLoading(false);
        if (!p?.success) return;
        const nextName = p.displayName ?? "";
        const nextAvatar = p.avatarUrl ?? "";
        setDisplayName(nextName);
        setAvatarUrl(nextAvatar);
        setNameDraft(nextName);
        if (cacheKey) {
          try {
            window.sessionStorage.setItem(cacheKey, JSON.stringify({ displayName: nextName, avatarUrl: nextAvatar }));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        if (!alive) return;
        setProfileLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [authStatus, session]);

  useEffect(() => {
    if (!changingPassword) return;
    const t = window.setTimeout(() => {
      newPasswordRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [changingPassword]);

  useEffect(() => {
    if (!avatarPreviewOpen) return;
    lastFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const t = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarPreviewOpen(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      const dialog = document.getElementById("avatar-preview-dialog");
      if (!dialog || !target) return;
      if (!dialog.contains(target)) {
        closeBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("focusin", onFocusIn);
      Promise.resolve().then(() => lastFocusRef.current?.focus());
    };
  }, [avatarPreviewOpen]);


  const signOut = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      setToast({ title: "已退出登录", tone: "info" });
    } catch {
      setToast({ title: "退出失败", tone: "error", durationMs: 3800 });
    }
  }, []);

  const saveName = useCallback(async () => {
    if (busy) return;
    const next = nameDraft.slice(0, MAX_NICKNAME_LEN);
    setBusy(true);
    try {
      const res = await fetch("/api/profiles/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: next, avatarUrl }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string; requestId?: string } | null;
      if (!res.ok || !data?.success) {
        const rid = data?.requestId ? `（请求号：${data.requestId}）` : "";
        setToast({ title: "保存失败", description: `${data?.error ?? "请重试"}${rid}`, tone: "error", durationMs: 3800 });
        return;
      }
      setDisplayName(next);
      setEditingName(false);
      setToast({ title: "已保存", description: "昵称已更新", tone: "success" });
      try {
        const userId = session?.user?.id;
        if (userId) {
          const cacheKey = `${PROFILE_CACHE_PREFIX}${userId}`;
          window.sessionStorage.setItem(cacheKey, JSON.stringify({ displayName: next, avatarUrl }));
        }
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
    }
  }, [avatarUrl, busy, nameDraft, session]);

  const updatePassword = useCallback(async () => {
    if (!newPassword || newPassword.length < 6) {
      setToast({ title: "密码过短", description: "密码至少 6 位", tone: "error", durationMs: 3800 });
      return;
    }
    if (!confirmPassword || confirmPassword.length < 6) {
      setToast({ title: "请确认新密码", description: "请再输入一次新密码", tone: "error", durationMs: 3800 });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ title: "两次输入不一致", description: "请检查确认密码", tone: "error", durationMs: 3800 });
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setChangingPassword(false);
      setToast({ title: "密码已更新", tone: "success" });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message ?? "更新失败")
          : "更新失败";
      setToast({ title: "更新失败", description: msg, tone: "error", durationMs: 3800 });
    } finally {
      setBusy(false);
    }
  }, [confirmPassword, newPassword]);

  const onPickAvatar = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setToast({ title: "文件不支持", description: "仅支持 JPG/PNG/WebP", tone: "error", durationMs: 3800 });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setToast({ title: "图片过大", description: "头像最大 2MB", tone: "error", durationMs: 3800 });
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      const dimOk = await new Promise<boolean>((resolve) => {
        img.onload = () => {
          const w = (img as HTMLImageElement).naturalWidth || 0;
          const h = (img as HTMLImageElement).naturalHeight || 0;
          URL.revokeObjectURL(url);
          resolve(w > 0 && h > 0 && w <= MAX_AVATAR_DIM && h <= MAX_AVATAR_DIM);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(false);
        };
        img.src = url;
      });
      if (!dimOk) {
        setToast({ title: "尺寸不合适", description: `头像建议不超过 ${MAX_AVATAR_DIM}×${MAX_AVATAR_DIM}`, tone: "error", durationMs: 3800 });
        return;
      }
    } catch {
      // 维持宽松：校验失败则继续走上传
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result ?? "");
      setAvatarBusy(true);
      try {
        const res = await fetch("/api/avatars/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = (await res.json().catch(() => null)) as { success?: boolean; publicUrl?: string; error?: string; requestId?: string } | null;
        if (!res.ok || !data?.success || !data.publicUrl) {
          const rid = data?.requestId ? `（请求号：${data.requestId}）` : "";
          setToast({
            title: "上传失败",
            description: `${data?.error ?? "请重试"}${rid}`,
            tone: "error",
            durationMs: 3800,
          });
          return;
        }
        // 头像策略 A：立刻生效 + 立刻写回 profiles
        const url = data.publicUrl;
        setAvatarUrl(url);
        const upsert = await fetch("/api/profiles/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: displayName.slice(0, MAX_NICKNAME_LEN), avatarUrl: url }),
        });
        const upsertData = (await upsert.json().catch(() => null)) as { success?: boolean; error?: string; requestId?: string } | null;
        if (!upsert.ok || !upsertData?.success) {
          const rid = upsertData?.requestId ? `（请求号：${upsertData.requestId}）` : "";
          setToast({ title: "头像已上传", description: `但保存失败，请稍后重试${rid}`, tone: "error", durationMs: 3800 });
          return;
        }
        setToast({ title: "头像已更新", tone: "success" });
        try {
          const userId = session?.user?.id;
          if (userId) {
            const cacheKey = `${PROFILE_CACHE_PREFIX}${userId}`;
            window.sessionStorage.setItem(cacheKey, JSON.stringify({ displayName: displayName.slice(0, MAX_NICKNAME_LEN), avatarUrl: url }));
          }
        } catch {
          // ignore
        }
      } finally {
        setAvatarBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }, [displayName, session]);

  const openAvatarPicker = useCallback(() => {
    if (profileLoading || busy || avatarBusy) return;
    avatarInputRef.current?.click();
  }, [avatarBusy, busy, profileLoading]);

  const openAvatarPreview = useCallback(() => {
    if (profileLoading || busy || avatarBusy) return;
    if (!avatarUrl) return;
    setAvatarPreviewOpen(true);
  }, [avatarBusy, avatarUrl, busy, profileLoading]);
  const clearToast = useCallback(() => setToast(null), []);

  return (
    <div className="apple-container py-10">
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />
      {avatarPreviewOpen && avatarUrl ? (
        <div
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label="头像预览"
          onClick={() => setAvatarPreviewOpen(false)}
        >
          <div className="w-full h-full flex items-center justify-center p-4">
            <div
              id="avatar-preview-dialog"
              className="relative max-w-[min(560px,calc(100vw-32px))] w-full rounded-2xl border border-white/10 bg-white/90 dark:bg-[oklch(0.16_0.004_265)]/90 backdrop-blur shadow-[0_20px_60px_oklch(0_0_0/0.35)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/70 dark:border-white/[0.08]">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">头像预览</div>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={() => setAvatarPreviewOpen(false)}
                  className="grid place-items-center h-9 w-9 rounded-xl text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors"
                  aria-label="关闭"
                >
                  <svg className="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <div className="mx-auto w-[min(420px,70vw)] aspect-square rounded-2xl overflow-hidden bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/[0.10]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt="头像预览" className="h-full w-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          设置
        </h1>

        <div className="mt-6">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">账号</div>

          {authed === false ? (
            <div className="mt-3">
              <InlineAlert
                title="尚未登录"
                description="登录后可创作、管理作品与个人资料。"
                action={
                  <button
                    type="button"
                    onClick={() => requestLoginDirect("登录后可创作、管理作品与个人资料")}
                    className="text-sm text-[color:var(--apple-blue)] hover:underline"
                  >
                    去登录
                  </button>
                }
              />
            </div>
          ) : (
            <div className="mt-3">
              <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] border-y border-zinc-100 dark:border-white/[0.06]">
                {/* 邮箱 */}
                <div className="py-3 flex items-center justify-between gap-4 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 w-[72px] shrink-0">邮箱</div>
                  <div className="min-w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {email || "—"}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={signOut}
                      className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                    >
                      退出登录
                    </button>
                  </div>
                </div>

                {/* 密码 */}
                {changingPassword ? (
                  <div className="py-3 flex items-start justify-between gap-4 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 w-[72px] shrink-0 pt-1.5">
                      密码
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 max-w-[320px]">
                        <div className="relative">
                          <input
                            ref={newPasswordRef}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            type={showNewPassword ? "text" : "password"}
                            className="h-9 w-full pr-9 rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
                            placeholder="新密码（至少 6 位）"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-white/[0.06] transition-colors"
                            aria-label={showNewPassword ? "隐藏密码" : "显示密码"}
                          >
                            {showNewPassword ? (
                              <svg className="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            ) : (
                              <svg className="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.02 4.56" />
                                <path d="M6.61 6.61A18.2 18.2 0 0 0 2 12s3.5 8 10 8a10.9 10.9 0 0 0 4.24-.88" />
                                <path d="m2 2 20 20" />
                              </svg>
                            )}
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            type={showConfirmPassword ? "text" : "password"}
                            className="h-9 w-full pr-9 rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
                            placeholder="确认新密码"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-white/[0.06] transition-colors"
                            aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                          >
                            {showConfirmPassword ? (
                              <svg className="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            ) : (
                              <svg className="block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.02 4.56" />
                                <path d="M6.61 6.61A18.2 18.2 0 0 0 2 12s3.5 8 10 8a10.9 10.9 0 0 0 4.24-.88" />
                                <path d="m2 2 20 20" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setChangingPassword(false);
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                        disabled={busy}
                        className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={updatePassword}
                        disabled={busy || newPassword.length < 6 || confirmPassword.length < 6}
                        className="h-8 px-3 rounded-lg text-xs font-medium text-white apple-btn-primary disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        更新
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-3 flex items-center justify-between gap-4 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 w-[72px] shrink-0">密码</div>
                    <div className="min-w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      ••••••••
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setChangingPassword(true)}
                        className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                      >
                        修改
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 个人资料 */}
        {authed ? (
          <div className="mt-10">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">个人资料</div>
            <div className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06] border-y border-zinc-100 dark:border-white/[0.06]">
              {/* 昵称 */}
              <div className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 w-[72px] shrink-0">昵称</div>
                <div className="min-w-0 flex-1">
                  {profileLoading ? (
                    <div className="h-5 w-[140px] rounded bg-zinc-100 dark:bg-white/[0.05] animate-pulse" />
                  ) : editingName ? (
                    <div className="flex items-center gap-3">
                      <input
                        value={nameDraft}
                        maxLength={MAX_NICKNAME_LEN}
                        onChange={(e) => setNameDraft(e.target.value.slice(0, MAX_NICKNAME_LEN))}
                        className="h-9 w-[240px] max-w-[60vw] rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
                        placeholder="比如：wiND"
                        inputMode="text"
                      />
                      <div className="text-[12px] tabular-nums text-zinc-500 dark:text-zinc-500 w-[44px] text-right">
                        {nameDraft.length}/{MAX_NICKNAME_LEN}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {displayName || "未设置"}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {editingName ? (
                    <>
                      <button
                        type="button"
                        onClick={saveName}
                        disabled={busy || profileLoading}
                        className="h-8 px-3 rounded-lg text-xs font-medium text-white apple-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingName(false);
                          setNameDraft(displayName);
                        }}
                        disabled={busy || profileLoading}
                        className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingName(true);
                        setNameDraft(displayName);
                      }}
                      disabled={profileLoading}
                      className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </div>

              {/* 头像 */}
              <div className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 w-[72px] shrink-0">头像</div>
                <div className="min-w-0 flex-1">
                  {profileLoading ? (
                    <div className="h-9 w-9 rounded-lg border border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.03] animate-pulse" />
                  ) : (
                    <button
                      type="button"
                      onClick={avatarUrl ? openAvatarPreview : openAvatarPicker}
                      className="h-9 w-9 rounded-lg border border-zinc-200/50 dark:border-white/[0.10] bg-zinc-50 dark:bg-white/[0.02] overflow-hidden disabled:opacity-60"
                      disabled={busy || avatarBusy}
                      aria-label={avatarUrl ? "预览头像" : "更换头像"}
                    >
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />
                      ) : null}
                    </button>
                  )}
                  {avatarBusy ? (
                    <span className="ml-3 inline-flex items-center text-xs text-zinc-500 dark:text-zinc-500">
                      正在更新…
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={openAvatarPicker}
                    disabled={profileLoading || busy || avatarBusy}
                    className="h-8 px-3 rounded-lg text-xs font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    更换
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onClick={(e) => {
                      // 允许重复选择同一文件也触发 onChange
                      (e.currentTarget as HTMLInputElement).value = "";
                    }}
                    onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </div>

          </div>
        ) : null}

      </div>
    </div>
  );
}

