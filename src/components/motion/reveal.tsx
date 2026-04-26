"use client";

import { motion, type MotionProps } from "framer-motion";
import { motionDurations, motionEase, motionDistances } from "@/lib/motion";

export interface RevealProps extends MotionProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "story";
  /**
   * 进入视口触发阈值（0~1），越大越“晚”触发。
   * 默认 0.35：更接近“滚动叙事”而非一上来全出来。
   */
  amount?: number;
  delay?: number;
}

export function Reveal({
  children,
  className,
  variant = "default",
  amount = 0.35,
  delay = 0,
  ...props
}: RevealProps) {
  const distance = variant === "story" ? motionDistances.yStory : motionDistances.y;
  const duration = variant === "story" ? motionDurations.story : motionDurations.medium;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration, ease: motionEase.out, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

