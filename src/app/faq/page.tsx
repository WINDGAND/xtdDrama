"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Item = {
  q: string;
  a: Array<string | { kind: "link"; label: string; href: string }>;
};

type Group = { title: string; items: Item[] };

function AnswerLine({ line }: { line: Item["a"][number] }) {
  if (typeof line === "string") return <span>{line}</span>;
  return (
    <Link
      href={line.href}
      prefetch
      className="text-[color:var(--apple-blue)] hover:underline"
    >
      {line.label}
    </Link>
  );
}

function FaqItem({ item, open, onToggle }: { item: Item; open: boolean; onToggle: () => void }) {
  return (
    <div className="py-1 border-b border-zinc-100 dark:border-white/[0.06]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={[
          "w-full text-left",
          "flex items-start justify-between gap-4",
          "py-3 px-2 -mx-2 rounded-lg transition-colors",
          "hover:bg-zinc-50 dark:hover:bg-white/[0.04]",
          // 只在键盘聚焦时显示 focus ring，鼠标点击不出现“蓝框”
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apple-blue)]",
        ].join(" ")}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 leading-6">
            {item.q}
          </div>
        </div>
        <span className="mt-1 text-zinc-400 dark:text-zinc-500 shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={open ? "rotate-180 transition-transform duration-150" : "transition-transform duration-150"}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <div
        className={[
          "grid transition-[grid-template-rows,opacity] duration-200",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {item.a.map((line, idx) => (
              <p key={idx} className={idx === 0 ? "" : "mt-1.5"}>
                <AnswerLine line={line} />
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FaqPage() {
  const groups = useMemo<Group[]>(
    () => [
      {
        title: "创作与上传",
        items: [
          {
            q: "支持哪些格式与大小？",
            a: [
              "创作页上传目前支持 JPG/PNG，最大 5MB。",
              "头像上传支持 JPG/PNG/WebP，最大 2MB，且建议不超过 1024×1024。",
              { kind: "link", label: "去创作页上传", href: "/create" },
            ],
          },
          {
            q: "为什么上传后会先显示“上传/分析”？",
            a: [
              "我们会先把图片准备好（必要时上传到存储），再让 AI 做视觉分析，最后给出风格方向。",
              "这一步是为了让后续生成更贴近你这张图，而不是泛泛地套模板。",
            ],
          },
        ],
      },
      {
        title: "生成与结果",
        items: [
          {
            q: "生成大概要多久？",
            a: [
              "生成图片通常约 20–40 秒，取决于网络与模型负载。",
              "生成 Live 图（短动态）通常稍长，约 30–60 秒，请耐心等待。",
              "如果你看到“生成中”停留更久，一般是上游排队，稍等或重试即可。",
            ],
          },
          {
            q: "生成失败怎么办？我需要重新上传吗？",
            a: [
              "一般不需要重新上传：可以直接点“重试生成”，或“重新查询”。",
              "如果多次失败，建议换一张更清晰的照片再试。",
            ],
          },
        ],
      },
      {
        title: "发布与互动",
        items: [
          {
            q: "发布后为什么点赞/评论不是立刻出现？",
            a: [
              "这是刻意设计：AI 的点赞与评论会在 25 秒内陆续出现，避免一次性刷屏，更像真实反馈。",
              "等它们“演完”一次后，同一作品再打开一般会直接显示最终状态。",
            ],
          },
          {
            q: "这些 AI 是谁？会不会说话很夸张？",
            a: [
              "互动角色是 Emma、Liam、Olivia、Noah、Sophia。",
              "它们的说话更偏真实口语，不走“夸夸群”路线，但每个人关注点不一样。",
            ],
          },
        ],
      },
      {
        title: "广场与作品详情",
        items: [
          {
            q: "为什么我在广场看到的点赞数/评论数会变化？",
            a: [
              "第一次进入某条作品时，AI 的互动会分批显现，所以你会看到数字逐步变化。",
              "如果你刷新，可能会直接显示最终状态（取决于浏览器是否已记录本次演出完成）。",
              { kind: "link", label: "去广场看看", href: "/plaza" },
            ],
          },
          {
            q: "我能把作品分享给别人吗？",
            a: [
              "你可以把作品详情页链接发给朋友（目前主要支持站内分享）。",
              "如果你希望一键分享到微信/QQ，我们会在后续版本补齐。",
            ],
          },
        ],
      },
      {
        title: "账号与设置",
        items: [
          {
            q: "修改昵称/头像后，刷新会丢吗？",
            a: [
              "不会。昵称与头像会保存到你的个人资料里，刷新或重新登录仍会保留。",
              { kind: "link", label: "去设置页", href: "/settings" },
            ],
          },
          {
            q: "为什么注册/登录偶尔会提示太频繁？",
            a: [
              "有时会触发认证服务的限流（例如短时间重复尝试）。稍等一会再试通常就能恢复。",
              "建议避免连续刷新或重复点按钮。",
            ],
          },
        ],
      },
    ],
    []
  );

  const flat = useMemo(() => groups.flatMap((g) => g.items.map((it) => it.q)), [groups]);
  const [openKey, setOpenKey] = useState<string>(flat[0] ?? "");

  return (
    <div className="apple-container py-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          常见问题
        </h1>

        <div className="mt-6 border-t border-zinc-100 dark:border-white/[0.06]">
          {groups.map((g) => (
            <section key={g.title} className="pt-6">
              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
                {g.title}
              </div>
              <div className="mt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                {g.items.map((it) => (
                  <FaqItem
                    key={it.q}
                    item={it}
                    open={openKey === it.q}
                    onToggle={() => setOpenKey((k) => (k === it.q ? "" : it.q))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

