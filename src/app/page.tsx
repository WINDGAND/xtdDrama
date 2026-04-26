"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/create");
  }, [router]);

  return (
    <div className="apple-container-narrow py-10">
      <div className="apple-panel px-5 py-4">
        <div className="text-sm text-zinc-700 dark:text-zinc-300">正在前往创作页…</div>
      </div>
    </div>
  );
}
