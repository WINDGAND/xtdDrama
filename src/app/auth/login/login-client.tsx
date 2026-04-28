"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { pushFlashToast } from "@/lib/flash-toast";
import { Toast } from "@/components/ui/toast";

type Mode = "signin" | "signup";

export function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<
    null | { title: string; description?: string; tone?: "success" | "error" | "info"; durationMs?: number }
  >(null);

  const title = mode === "signin" ? "登录" : "注册";
  const switchHint = mode === "signin" ? "没有账号？去注册" : "已有账号？去登录";

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !busy;
  }, [busy, email, password]);
  const clearToast = useCallback(() => setToast(null), []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const e = email.trim();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: e, password });
        if (error) throw error;
        setToast({ title: "注册成功", description: "正在登录…", tone: "success" });
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: e, password });
        if (signInError) throw signInError;
        pushFlashToast({ title: "已注册并登录", tone: "success" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        pushFlashToast({ title: "登录成功", tone: "success" });
      }
      router.replace(nextPath);
    } catch (err: unknown) {
      const e = err as { message?: unknown; status?: unknown };
      const status = typeof e?.status === "number" ? e.status : undefined;
      if (status === 429) {
        setToast({ title: "操作太频繁", description: "请稍后再试", tone: "error", durationMs: 3800 });
      } else {
        const msg =
          err && typeof err === "object" && "message" in err ? String(e.message ?? "操作失败，请重试") : "操作失败，请重试";
        setToast({ title: "操作失败", description: msg, tone: "error", durationMs: 3800 });
      }
    } finally {
      setBusy(false);
    }
  }, [canSubmit, email, mode, nextPath, password, router]);

  return (
    <div className="apple-container py-10">
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />

      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">登录后才能创作与发布；游客可继续浏览广场与作品详情。</p>
        </div>

        <div className="mt-8 border-t border-zinc-100 dark:border-white/[0.06] pt-6">
          <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">邮箱</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            className="mt-2 w-full h-10 rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
            placeholder="name@example.com"
          />

          <label className="mt-4 block text-sm font-medium text-zinc-800 dark:text-zinc-200">密码</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="mt-2 w-full h-10 rounded-lg border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] px-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[color:var(--apple-blue)]"
            placeholder="至少 6 位"
          />

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={[
              "mt-6 w-full h-10 rounded-lg text-sm font-semibold text-white apple-btn-primary",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {busy ? "处理中…" : title}
          </button>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
              className="text-sm text-[color:var(--apple-blue)] hover:underline"
            >
              {switchHint}
            </button>
            <Link href={nextPath} className="text-sm text-zinc-500 hover:underline">
              先逛逛
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

