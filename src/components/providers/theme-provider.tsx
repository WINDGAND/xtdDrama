/**
 * ThemeProvider — 双态主题提供者
 *
 * 职责：
 *   - 封装 next-themes 的 ThemeProvider，统一管理亮色/暗色状态
 *   - 声明为 "use client"，因为主题状态属于客户端运行时行为
 *   - attribute="class" 使 next-themes 通过 .dark class 控制主题，
 *     与 Tailwind CSS v4 的 @custom-variant dark 声明保持一致
 *
 * 使用方式：
 *   在 RootLayout 中包裹全局内容，使整个应用享有主题切换能力
 */

"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      /* 通过 .dark class 触发 Tailwind 暗色变量 */
      attribute="class"
      /* 默认强制亮色——符合「极简亮色初始态」设计原则 */
      defaultTheme="light"
      /* 允许响应系统主题偏好切换 */
      enableSystem
      /* 禁止切换时的闪烁 */
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
