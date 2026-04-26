"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type ThemeValue = "light" | "dark" | "system";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const current = (mounted ? (theme as ThemeValue | undefined) : undefined) ?? "light";

  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          设置
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          主题仅支持“跟随系统 / 手动切换”。不会因业务流程自动切换（PRD 强约束）。
        </p>

        <div className="mt-6 apple-panel px-5 py-4">
          <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            主题
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { value: "system", label: "跟随系统" },
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ] as const).map((x) => {
              const selected = current === x.value;
              return (
                <button
                  key={x.value}
                  type="button"
                  onClick={() => setTheme(x.value)}
                  className={[
                    "h-10 rounded-lg border text-sm font-medium transition-colors duration-150",
                    selected
                      ? "border-[color:var(--apple-blue)] bg-[oklch(0.96_0.015_250)] text-zinc-900 dark:bg-white/[0.06] dark:text-zinc-100"
                      : "border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  {x.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

