"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useAuth } from "@/components/providers/auth-provider";
import { Toast } from "@/components/ui/toast";
import { consumeFlashToast } from "@/lib/flash-toast";
import { requestLoginDirect } from "@/lib/request-login";
import { DRAMA_WORD_GRADIENT_CLASS } from "@/lib/drama-word-style";

const NAV_LINKS = [
  { label: "广场", href: "/plaza" },
  { label: "创作", href: "/create" },
  { label: "我的", href: "/me" },
  { label: "设置", href: "/settings" },
  { label: "常见问题", href: "/faq" },
];

export function AppHeader() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const { status: authStatus } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<null | {
    title: string;
    description?: string;
    tone?: "success" | "error" | "info";
    durationMs?: number;
  }>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const resolvedPath = pathname ?? "";

  useEffect(() => {
    const msg = consumeFlashToast();
    if (msg) Promise.resolve().then(() => setToast(msg));
  }, [pathname]);

  useEffect(() => {
    const onInstantToast = (e: Event) => {
      const detail = (e as CustomEvent<{ title: string; tone?: "success" | "error" | "info"; durationMs?: number }>).detail;
      if (detail?.title) setToast(detail);
    };
    window.addEventListener("xtdDrama:instant-toast", onInstantToast as EventListener);
    return () => window.removeEventListener("xtdDrama:instant-toast", onInstantToast as EventListener);
  }, []);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  const logoSrc = "/logo.png";

  const authed = authStatus === "authed";

  const clearToast = useCallback(() => setToast(null), []);

  const signOut = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      setToast({ title: "已退出登录", tone: "info" });
    } catch {
      setToast({ title: "退出失败", tone: "error", durationMs: 3800 });
    }
  };

  const navActive = (href: string) => resolvedPath === href;

  return (
    <>
      <Toast
        title={toast?.title ?? ""}
        description={toast?.description}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClear={clearToast}
      />
      <header
        className={[
          "sticky top-0 z-50 w-full",
          "border-b border-zinc-200/80 dark:border-white/[0.07]",
          "bg-white/80 dark:bg-[oklch(0.13_0.004_265)]/80",
          "backdrop-blur-xl",
          "transition-colors duration-200",
        ].join(" ")}
        style={{ viewTransitionName: "site-header" }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="grid h-14 sm:h-16 grid-cols-[1fr_auto_1fr] items-center">
            <Link href="/create" prefetch className="flex items-center gap-2 select-none" aria-label="回到创作页">
              <div className="relative h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
                <Image
                  src={logoSrc}
                  alt="小题大Drama"
                  fill
                  sizes="40px"
                  priority
                  unoptimized
                  className="object-contain"
                />
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                小题大
              </span>
              <span className={["text-[15px] font-semibold tracking-tight", DRAMA_WORD_GRADIENT_CLASS].join(" ")}>
                Drama
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-0.5">
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={label}
                  href={href}
                  prefetch
                  className={[
                    "px-3.5 py-1.5 rounded-md text-sm",
                    navActive(href)
                      ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100/70 dark:bg-white/[0.06]"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06]",
                    "transition-colors duration-150",
                  ].join(" ")}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="col-start-3 flex items-center justify-end gap-2">
              {authed ? (
                <button
                  type="button"
                  onClick={signOut}
                  className="flex h-8 items-center px-4 rounded-md text-[13px] font-medium border border-zinc-200/80 dark:border-white/[0.10] text-zinc-700 dark:text-zinc-200 bg-white/70 dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                >
                  退出登录
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => requestLoginDirect()}
                  className={[
                    "flex h-8 items-center px-4 rounded-md",
                    "text-[13px] font-medium text-white",
                    "apple-btn-primary",
                  ].join(" ")}
                >
                  进入/登录
                </button>
              )}

              {mounted && (
                <button
                  onClick={toggleTheme}
                  aria-label={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
                  className={[
                    "w-8 h-8 rounded-md flex items-center justify-center",
                    "text-zinc-400 dark:text-zinc-500",
                    "hover:text-zinc-700 dark:hover:text-zinc-300",
                    "hover:bg-zinc-100 dark:hover:bg-white/[0.06]",
                    "transition-colors duration-150",
                  ].join(" ")}
                >
                  {theme === "dark" ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav
        aria-label="底部导航"
        className={[
          "md:hidden fixed inset-x-0 bottom-0 z-40",
          "border-t border-zinc-200/80 dark:border-white/[0.08]",
          "bg-white/85 dark:bg-[oklch(0.13_0.004_265)]/85",
          "backdrop-blur-xl",
        ].join(" ")}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="px-4">
          <div className="h-14 flex items-center justify-around">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                prefetch
                className={[
                  "flex flex-col items-center justify-center gap-1",
                  "min-w-[64px] py-1.5 rounded-lg",
                  navActive(href)
                    ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100/80 dark:bg-white/[0.06]"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06]",
                  "transition-colors duration-150",
                ].join(" ")}
              >
                {label === "广场" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 10.5 12 4l9 6.5" />
                    <path d="M5 10v10h14V10" />
                    <path d="M9 20v-6h6v6" />
                  </svg>
                ) : label === "创作" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                  </svg>
                ) : label === "我的" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ) : label === "常见问题" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4" />
                    <path d="M12 17h.01" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 0-2.8 2 2 0 0 1 2.8 0l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 0 2 2 0 0 1 0 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.2a1.7 1.7 0 0 0-1.4 1Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
                <span className="text-[11px] font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
