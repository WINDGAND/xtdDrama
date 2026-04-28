export default function CreateLoading() {
  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-8">
          {/* 段1：标题区（居中） */}
          <div className="pt-2 text-center mx-auto w-full max-w-4xl space-y-3">
            <div className="h-12 w-full max-w-xl mx-auto rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-12 w-full max-w-lg mx-auto rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            <div className="h-4 w-full max-w-sm mx-auto rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
          </div>

          {/* 段2：示例图（桌面端提前，移动端在后） */}
          <div className="order-4 lg:order-2">
            <div className="mx-auto w-full max-w-5xl">
              <div className="h-5 w-52 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
              <div className="mt-3 h-64 sm:h-72 w-full rounded-xl border border-zinc-100 dark:border-white/[0.06] bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            </div>
          </div>

          {/* 段3：左右两列（引导 / 上传入口） */}
          <div className="order-2 lg:order-3">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10 items-start">
              <div className="border-t border-zinc-100 dark:border-white/[0.06] pt-6 space-y-3">
                <div className="h-5 w-60 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
                <div className="h-4 w-full max-w-md rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
                <div className="h-3 w-64 rounded-md bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
                <div className="pt-2 space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-10 w-full rounded-lg bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
                  ))}
                </div>
              </div>

              <div className="h-64 w-full rounded-xl border border-zinc-100 dark:border-white/[0.06] bg-zinc-100 dark:bg-white/[0.06] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
