"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  children: ReactNode;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

/**
 * Beta feedback: "Upgrade tooltips. It shouldnt be the plain html tooltips. It should be unique,
 * our colors plus our logo icon, then the tooltip message." A shared, branded tooltip (the app's
 * own bg3/gold palette, a small logo mark, a real fade/scale-in) to replace bare `title=`
 * attributes, which render as the browser's own unstyled OS tooltip with a multi-second hover
 * delay and zero brand identity. Uses framer-motion for the entrance (already a dependency
 * throughout this codebase) rather than the plain CSS `animate-in` utility classes the original
 * spec sketched, since those need the tailwindcss-animate plugin, which isn't installed here.
 */
export function Tooltip({ children, content, position = "top" }: TooltipProps) {
  const [show, setShow] = useState(false);

  const positionClasses: Record<NonNullable<TooltipProps["position"]>, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };
  const arrowClasses: Record<NonNullable<TooltipProps["position"]>, string> = {
    top: "top-full left-1/2 -translate-x-1/2 -translate-y-1/2 border-t-0 border-l-0",
    bottom: "bottom-full left-1/2 -translate-x-1/2 translate-y-1/2 border-b-0 border-r-0",
    left: "left-full top-1/2 -translate-x-1/2 -translate-y-1/2 border-b-0 border-l-0",
    right: "right-full top-1/2 translate-x-1/2 -translate-y-1/2 border-t-0 border-r-0",
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            role="tooltip"
            className={cn(
              "glass pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-bg3 px-2.5 py-1.5 font-noto text-xs text-ivory shadow-lg",
              positionClasses[position]
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-32.png" alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" />
            {content}
            <span className={cn("absolute h-2 w-2 rotate-45 border border-white/10 bg-bg3", arrowClasses[position])} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
