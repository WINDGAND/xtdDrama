/**
 * RootLayout — Next.js App Router 根布局
 *
 * 职责：
 *   1. 注入全局字体（Geist Sans + Geist Mono）
 *   2. 包裹 ThemeProvider，使整个应用具备双态主题切换能力
 *   3. 挂载 AppShell 全局骨架（含导航栏与 max-w-md 居中容器）
 *   4. 配置应用元数据（SEO / PWA 入口）
 *
 * 架构说明：
 *   - ThemeProvider 需包裹在 <html> 之外是不允许的，
 *     因此它放置于 <body> 内、页面内容之外的最外层
 *   - suppressHydrationWarning 是 next-themes 的必要配置，
 *     防止服务端渲染主题 class 不匹配时产生 React warning
 */

import type { Metadata, Viewport } from "next";
/**
 * 使用 geist npm 包而非 next/font/google，
 * 避免构建时访问 Google Fonts CDN（国内网络环境不稳定）
 */
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

/* ----------------------------------------------------------------
 * 应用元数据（SEO & 社交分享）
 * ---------------------------------------------------------------- */
export const metadata: Metadata = {
  title: {
    default: "小题大Drama — AI视觉情绪重构",
    template: "%s | 小题大Drama",
  },
  description:
    "上传你的日常瞬间，AI 将其重构为极度夸张的视觉梗图，配合赛博 NPC 互动，让无聊变成戏剧。",
  keywords: ["AI", "视觉互动", "表情包", "情绪重构", "小题大作", "Drama"],
  authors: [{ name: "wiND" }],
  creator: "小题大Drama",
  /* 确保移动端 viewport 正确，增强 App 沉浸感 */
  metadataBase: new URL("https://drama-fyer-demo.vercel.app"),
};

/* ----------------------------------------------------------------
 * 视口配置（移动端优先）
 * ---------------------------------------------------------------- */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    /* 亮色态：纯白导航栏色 */
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    /* 暗色态：zinc-950 深色导航栏色 */
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/* ----------------------------------------------------------------
 * 根布局组件
 * ---------------------------------------------------------------- */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      /* suppressHydrationWarning: next-themes 在客户端注入 .dark class，
         会导致服务端与客户端 HTML 不一致，此属性消除该警告 */
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
    >
      <body className="min-h-full">
        {/**
         * ThemeProvider 包裹整个应用
         * 所有子组件均可通过 useTheme() 读取/切换主题状态
         */}
        <ThemeProvider>
          {/**
           * AppShell 提供统一的移动端框架
           * - 桌面端：居中 max-w-md 内容列 + 背景填充
           * - 包含全局顶部导航栏（AppHeader）
           */}
          <AppShell>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
