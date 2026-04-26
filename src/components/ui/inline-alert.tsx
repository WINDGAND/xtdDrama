"use client";

export function InlineAlert({
  tone = "neutral",
  title,
  description,
  action,
}: {
  tone?: "neutral" | "danger" | "success";
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "success"
        ? "text-green-700 dark:text-green-400"
        : "text-zinc-700 dark:text-zinc-300";

  return (
    <div className="px-1">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</div>
      {description && (
        <div className={`mt-1 text-sm ${toneCls} leading-relaxed`}>{description}</div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

