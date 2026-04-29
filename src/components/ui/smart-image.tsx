"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { emitImageMetric } from "@/lib/image-observability";
import { nextImageEnabled, smartImageEnabled } from "@/lib/image-flags";

type Props = {
  src: string;
  alt: string;
  page: "plaza" | "create" | "post-detail" | "other";
  slot: string;
  sizes?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  fallbackHeightClassName?: string;
  onClick?: () => void;
  enableLightSkeleton?: boolean;
};

function appendRetryParam(src: string, retry: number) {
  if (retry <= 0) return src;
  if (src.startsWith("data:")) return src;
  const delimiter = src.includes("?") ? "&" : "?";
  return `${src}${delimiter}r=${retry}`;
}

export function SmartImage({
  src,
  alt,
  page,
  slot,
  sizes = "100vw",
  className = "",
  imageClassName = "",
  priority = false,
  fallbackHeightClassName = "h-[240px]",
  onClick,
  enableLightSkeleton = true,
}: Props) {
  const smartEnabled = smartImageEnabled();
  const useNextImage = nextImageEnabled();
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const startAtRef = useRef(0);

  useEffect(() => {
    startAtRef.current = Date.now();
  }, [src, retry]);

  const resolvedSrc = useMemo(() => appendRetryParam(src, retry), [retry, src]);

  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-xl",
        "border border-zinc-200/30 dark:border-white/[0.08]",
        className,
      ].join(" ")}
    >
      {status !== "loaded" && enableLightSkeleton ? (
        <div
          className={[
            "absolute inset-0 animate-pulse bg-zinc-100/80 dark:bg-white/[0.05]",
            fallbackHeightClassName,
          ].join(" ")}
          aria-hidden="true"
        />
      ) : null}

      {status === "error" ? (
        <div
          className={[
            "flex flex-col items-center justify-center gap-2 text-center px-4",
            "text-xs text-zinc-500 dark:text-zinc-400",
            fallbackHeightClassName,
          ].join(" ")}
        >
          <span>图片加载失败</span>
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setRetry((v) => v + 1);
            }}
            className="text-[color:var(--apple-blue)] hover:underline"
          >
            点击重试
          </button>
        </div>
      ) : (
        useNextImage && smartEnabled ? (
          <Image
            src={resolvedSrc}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            unoptimized={src.startsWith("data:")}
            className={imageClassName}
            onLoad={() => {
              setStatus("loaded");
              emitImageMetric({
                event: "load",
                page,
                slot,
                src,
                durationMs: Date.now() - startAtRef.current,
              });
            }}
            onError={() => {
              setStatus("error");
              emitImageMetric({
                event: "error",
                page,
                slot,
                src,
                durationMs: Date.now() - startAtRef.current,
                reason: "image_error",
              });
            }}
            onClick={onClick}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedSrc}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className={`h-full w-full ${imageClassName}`}
            onLoad={() => {
              setStatus("loaded");
              emitImageMetric({
                event: "load",
                page,
                slot,
                src,
                durationMs: Date.now() - startAtRef.current,
              });
            }}
            onError={() => {
              setStatus("error");
              emitImageMetric({
                event: "error",
                page,
                slot,
                src,
                durationMs: Date.now() - startAtRef.current,
                reason: "image_error",
              });
            }}
            onClick={onClick}
          />
        )
      )}
    </div>
  );
}
