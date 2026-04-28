/**
 * AppShell — 应用全局布局骨架（多端响应式版）
 *
 * 响应式断点策略：
 *   mobile  (< 768px)  : 单列，全宽，移动端卡片体验
 *   tablet  (768~1024px): 单列加宽，内容区增加留白
 *   desktop (> 1024px) : 最大宽度 max-w-7xl，内容可展开为多列网格
 *
 * 布局层级：
 *   <html>
 *     <body>
 *       <AppShell>
 *         <AppHeader />          ← 全宽顶部栏，内部 max-w-7xl 居中
 *         <main>                 ← 全宽内容区，由各页面自行控制内部列数
 *           {children}
 *         </main>
 *       </AppShell>
 *     </body>
 *   </html>
 */

import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { ViewTransitionMain } from "./view-transition-main";
import LoginGateModal from "@/components/ui/login-gate-modal";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    /**
     * 全屏背景层
     * - 亮色：bg-white（纯白，强调极简感）
     * - 暗色：bg-zinc-950（最深黑，沉浸感）
     */
    <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300">

      {/* 全局顶部导航栏 */}
      <AppHeader />

      {/**
       * 页面主内容区
       * - 不在此处限制宽度，由各子页面决定内容区宽度策略
       * - flex-1 撑满剩余高度
       */}
      <main className="flex-1 pb-20 md:pb-0">
        <ViewTransitionMain>{children}</ViewTransitionMain>
      </main>

      <LoginGateModal />
    </div>
  );
}
