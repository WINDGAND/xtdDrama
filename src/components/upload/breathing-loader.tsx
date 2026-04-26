/**
 * BreathingLoader — 极简呼吸灯加载提示
 *
 * 设计意图：
 *   这是"平庸阶段"的最后一幕——纯白背景上，一行灰色细文字
 *   像呼吸一样缓慢地明暗交替，暗示 AI 正在静静地"扫描"现实。
 *
 *   克制到极点，不加任何旋转图标、进度条、百分比。
 *   越无趣的等待，越衬托出后续"炸裂突变"的戏剧性。
 *
 * 动画参数：
 *   - 呼吸周期：2.4s（模拟真实呼吸节律）
 *   - 最低不透明度：0.25（始终可见，不完全消失）
 *   - easing：easeInOut（自然过渡，无机械感）
 */

"use client";

import { motion } from "framer-motion";

interface BreathingLoaderProps {
  /** 自定义提示文案，默认为 AI 感知文案 */
  text?: string;
}

export function BreathingLoader({
  text = "AI 正在感知你的平庸日常...",
}: BreathingLoaderProps) {
  return (
    /**
     * 外层容器：居中，从底部淡入（整体出现动画）
     * initial/animate: 组件挂载时从透明 + 微下移 → 正常位置
     */
    <motion.div
      className="flex flex-col items-center gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* ——— 呼吸灯指示点 ———————————————————————————————————————— */}
      <div className="flex items-center gap-1.5">
        {[0, 0.4, 0.8].map((delay) => (
          <motion.span
            key={delay}
            className="w-1 h-1 rounded-full bg-zinc-300"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }}
          />
        ))}
      </div>

      {/* ——— 呼吸文字 ——————————————————————————————————————————— */}
      <motion.p
        className="text-sm text-zinc-400 font-light tracking-wide select-none"
        animate={{ opacity: [0.25, 0.7, 0.25] }}
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {text}
      </motion.p>
    </motion.div>
  );
}
