"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toast } from "@/components/ui/toast";

export function PlazaPublishedNotice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const publishedId = searchParams.get("published");
  const handledIdRef = useRef<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const clearToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  useEffect(() => {
    if (!publishedId || handledIdRef.current === publishedId) return;
    handledIdRef.current = publishedId;
    setToastVisible(true);
    router.refresh();

    const body = JSON.stringify({ postId: publishedId });
    const triggerInteraction = (path: string) => {
      void fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch((err) => {
        console.warn("[PlazaPublishedNotice] NPC interaction trigger failed:", path, err);
      });
    };

    triggerInteraction("/api/likes/npc-generate");
    triggerInteraction("/api/comments/generate");
  }, [publishedId, router]);

  return (
    <Toast
      title={toastVisible ? "发布成功" : ""}
      description="已同步到广场，NPC 正在赶来互动。"
      tone="success"
      durationMs={4200}
      onClear={clearToast}
    />
  );
}
