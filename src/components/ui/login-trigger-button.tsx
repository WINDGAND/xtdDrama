"use client";

import { requestLogin, requestLoginDirect } from "@/lib/request-login";

export function LoginTriggerButton({
  hint,
  direct = false,
  className,
  children,
}: {
  hint?: string;
  /** 若为 true，点击直接弹出表单而不经过提示确认页 */
  direct?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => (direct ? requestLoginDirect(hint) : requestLogin(hint))}
      className={className}
    >
      {children ?? "去登录"}
    </button>
  );
}
