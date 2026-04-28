"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { LoginRequestDetail } from "@/lib/request-login";

const DEFAULT_HINT = "登录以使用全部功能~";

type Phase = "prompt" | "form";
type FormMode = "signin" | "signup";

export default function LoginGateModal() {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(DEFAULT_HINT);
  const [phase, setPhase] = useState<Phase>("prompt");
  const [formMode, setFormMode] = useState<FormMode>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const close = useCallback(() => {
    setOpen(false);
    setPhase("prompt");
    setEmail("");
    setPassword("");
    setErrorMsg("");
    setBusy(false);
  }, []);

  const openForm = useCallback(() => {
    setPhase("form");
  }, []);

  useEffect(() => {
    const onRequestLogin = (event: Event) => {
      const detail = (event as CustomEvent<LoginRequestDetail>).detail;
      setHint(detail?.hint?.trim() || DEFAULT_HINT);
      setPhase(detail?.direct ? "form" : "prompt");
      setEmail("");
      setPassword("");
      setErrorMsg("");
      setBusy(false);
      setOpen(true);
    };

    window.addEventListener("xtdDrama:request-login", onRequestLogin as EventListener);
    return () => window.removeEventListener("xtdDrama:request-login", onRequestLogin as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);

    const timer = window.setTimeout(() => {
      if (phase === "form") {
        emailRef.current?.focus();
      } else {
        closeRef.current?.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open, phase]);

  const canSubmit = useMemo(
    () => email.trim().length > 3 && password.length >= 6 && !busy,
    [busy, email, password]
  );

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const supabase = createBrowserSupabaseClient();
      const e = email.trim();
      if (formMode === "signup") {
        const { error } = await supabase.auth.signUp({ email: e, password });
        if (error) throw error;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: e, password });
        if (signInError) throw signInError;
        window.dispatchEvent(new CustomEvent("xtdDrama:instant-toast", { detail: { title: "已注册并登录", tone: "success" } }));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        window.dispatchEvent(new CustomEvent("xtdDrama:instant-toast", { detail: { title: "登录成功", tone: "success" } }));
      }
      close();
    } catch (err: unknown) {
      const e = err as { message?: unknown; status?: unknown };
      const status = typeof e?.status === "number" ? e.status : undefined;
      if (status === 429) {
        setErrorMsg("操作太频繁，请稍后再试");
      } else {
        setErrorMsg(
          err && typeof err === "object" && "message" in err
            ? String(e.message ?? "操作失败，请重试")
            : "操作失败，请重试"
        );
      }
    } finally {
      setBusy(false);
    }
  }, [canSubmit, close, email, formMode, password]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={phase === "form" ? (formMode === "signin" ? "登录" : "注册") : "登录提示"}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/20 dark:bg-black/40"
        aria-label="关闭"
        onClick={close}
      />

      <div
        className={[
          "relative w-[min(88vw,360px)]",
          "rounded-2xl border border-zinc-200/70 dark:border-white/[0.10]",
          "bg-white/95 dark:bg-[oklch(0.18_0.004_265)]/95 backdrop-blur",
          "shadow-[0_18px_55px_oklch(0_0_0/0.18)] dark:shadow-[0_18px_55px_oklch(0_0_0/0.45)]",
          "px-5 py-5",
        ].join(" ")}
      >
        {phase === "prompt" ? (
          <>
            <div className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              需要登录
            </div>
            <div className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {hint}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="h-9 px-4 rounded-lg text-sm text-zinc-800 dark:text-zinc-100 bg-zinc-100/80 dark:bg-white/[0.06] hover:bg-zinc-200/70 dark:hover:bg-white/[0.10] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)]"
              >
                先逛逛
              </button>
              <button
                type="button"
                onClick={openForm}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white apple-btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)]"
              >
                去登录
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                {formMode === "signin" ? "登录" : "注册"}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="关闭"
                className="h-7 w-7 grid place-items-center rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">邮箱</label>
                <input
                  ref={emailRef}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="mt-1.5 w-full h-9 rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">密码</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete={formMode === "signup" ? "new-password" : "current-password"}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="mt-1.5 w-full h-9 rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
                  placeholder="至少 6 位"
                />
              </div>

              {errorMsg ? (
                <div className="text-[12.5px] text-rose-600 dark:text-rose-400 leading-snug">
                  {errorMsg}
                </div>
              ) : null}

              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="mt-1 w-full h-9 rounded-lg text-sm font-semibold text-white apple-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? "处理中…" : formMode === "signin" ? "登录" : "注册"}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setFormMode((m) => (m === "signin" ? "signup" : "signin"));
                  setErrorMsg("");
                }}
                className="text-[12.5px] text-[color:var(--apple-blue)] hover:underline"
              >
                {formMode === "signin" ? "没有账号？去注册" : "已有账号？去登录"}
              </button>
              <button
                type="button"
                onClick={close}
                className="text-[12.5px] text-zinc-500 dark:text-zinc-500 hover:underline"
              >
                先逛逛
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
