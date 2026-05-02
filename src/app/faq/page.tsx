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
        title: "上传与 AI 感知",
        items: [
          {
            q: "支持上传什么类型的图片？有大小限制吗？",
            a: [
              "支持 JPG / PNG / WebP 格式，单张最大 10 MB。",
              "上传后 AI 会自动分析图片的主体、场景与情绪，通常在 5 秒内完成——这一步是让生成结果贴近你这张图、而不是泛泛套模板的关键。",
              { kind: "link", label: "去创作页试试", href: "/create" },
            ],
          },
          {
            q: "什么样的图片效果最好？",
            a: [
              "主体清晰、背景不过于杂乱的照片效果最佳——AI 需要能"认出"照片里发生了什么。",
              "日常生活照、物品特写、食物、宠物都非常适合；强烈模糊或纯黑暗场景可能影响分析质量。",
              "插画、二次元等非真实照片也支持，AI 会尽力理解内容并给出改造方向。",
            ],
          },
          {
            q: "AI 分析出来的"主体/场景/情绪"不准，怎么纠正？",
            a: [
              "感知结果只是辅助生成的参考，不需要完全准确。",
              "你可以在风格选项下方填写「你的想法」，用一句话告诉 AI 你希望往哪个方向走——比如"把这碗面变成米其林大厨在烹饪"——AI 会据此直接生成。",
            ],
          },
        ],
      },
      {
        title: "风格选择与生成",
        items: [
          {
            q: "三个风格选项是怎么来的？不满意可以换吗？",
            a: [
              "AI 会根据你上传图片的具体内容动态生成三个差异化的改造方向，不是固定模板——每个方向对应不同的 Drama 手法（比如光影戏剧化、材质异化或精灵具现）。",
              "不满意可以点"换一批"，最多可换 3 批；也可以在底部直接填写自定义想法一键生成。",
            ],
          },
          {
            q: "生成图片大概需要多久？",
            a: [
              "生成图片（HY-Image）通常约 20–40 秒；生成 Live 图短动态（HY-Video）通常约 40–80 秒。",
              "实际时长取决于模型当前负载，高峰期可能稍长，页面会持续轮询直到结果返回，无需手动刷新。",
            ],
          },
          {
            q: "生成失败了，需要重新上传图片吗？",
            a: [
              "不需要。图片和 AI 分析结果都会保留——直接点「重试生成」即可用同一张图重新生成。",
              "如果任务 ID 存在，还可以点「重新查询」看是否已有结果。",
              "多次失败时，系统会自动切换演示模式展示预置效果，方便你继续体验完整流程。",
            ],
          },
          {
            q: "生成的图和我的原图结构差太多，怎么改善？",
            a: [
              "系统会提取原图的「结构骨架」并在生成时锁定空间位置，但效果受模型能力限制，部分情况下结构漂移属于正常现象。",
              "改善方式：①换一个描述更精确的风格方向；②在自定义提示中加入约束，比如「保持主体位置和比例不变」；③直接点「重试生成」，同一方向往往每次结果都不同。",
            ],
          },
        ],
      },
      {
        title: "发布与广场互动",
        items: [
          {
            q: "发布后 NPC 的点赞和评论多久到？",
            a: [
              "发布后约 25 秒内，Emma、Liam、Olivia、Noah、Sophia 五位 AI 角色会陆续点赞并留下评论。",
              "这是刻意设计成「分批出现」的效果，让反馈更像真实朋友圈的氛围，而不是一次性刷屏。",
            ],
          },
          {
            q: "NPC 的评论风格是怎样的？每次都一样吗？",
            a: [
              "五位角色各有性格：Emma 冷幽默、Liam 理性克制、Olivia 温柔共情、Noah 直接玩梗、Sophia 关注细节与氛围。",
              "评论内容会结合你的作品主体、情绪和风格动态生成，每次都不同，不是套话，也不走夸夸群路线。",
            ],
          },
          {
            q: "发布的作品能被别人看到吗？我能删除吗？",
            a: [
              "发布到广场后，所有访客都可以看到你的作品和 NPC 互动。",
              "你可以在「我的」页面找到自己发布的作品，点击右上角菜单选择删除；删除后作品将从广场移除。",
              { kind: "link", label: "去我的页面", href: "/me" },
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
