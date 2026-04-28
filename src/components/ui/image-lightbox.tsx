"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  src: string;
  alt?: string;
  onClose: () => void;
};

export function ImageLightbox({ src, alt = "", onClose }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // 防止 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const content = (
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="查看大图"
    >
      {/* 蒙层 */}
      <button
        type="button"
        aria-label="关闭预览"
        className="absolute inset-0 bg-black/75 dark:bg-black/85 cursor-zoom-out"
        onClick={onClose}
      />

      {/* 顶栏 */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 pointer-events-none">
        <span className="text-sm font-medium text-white/80 select-none">查看大图</span>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className={[
            "pointer-events-auto",
            "h-8 px-3 rounded-lg text-xs font-medium",
            "bg-white/10 hover:bg-white/20",
            "text-white/90 hover:text-white",
            "border border-white/20",
            "transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
          ].join(" ")}
        >
          关闭
        </button>
      </div>

      {/* 图片区域 */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-6 min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : null;
}
