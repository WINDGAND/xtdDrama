"use client";

import { ViewTransition } from "react";

/**
 * 包裹主内容区，使 App Router 路由导航在启用 experimental.viewTransition 时获得原生过渡。
 * 不支持 View Transitions 的浏览器会忽略，行为与未包裹时一致。
 */
export function ViewTransitionMain({ children }: { children: React.ReactNode }) {
  return <ViewTransition default="none">{children}</ViewTransition>;
}
