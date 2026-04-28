export type LoginRequestDetail = {
  hint?: string;
  /** 若为 true，弹窗直接展示登录表单，跳过"提示确认"步骤 */
  direct?: boolean;
};

export function requestLogin(hint?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LoginRequestDetail>("xtdDrama:request-login", {
      detail: { hint },
    })
  );
}

export function requestLoginDirect(hint?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<LoginRequestDetail>("xtdDrama:request-login", {
      detail: { hint, direct: true },
    })
  );
}
