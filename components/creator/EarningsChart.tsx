"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export interface EarningsBreakdownItem {
  label: string;
  percent: number;
  color: string;
}

const DEFAULT_BREAKDOWN: EarningsBreakdownItem[] = [
  { label: "Coins", percent: 40, color: "bg-gold" },
  { label: "Ads", percent: 25, color: "bg-plat" },
  { label: "Platinum", percent: 30, color: "bg-clay2" },
  { label: "Bonuses", percent: 5, color: "bg-green2" },
];

export interface EarningsChartProps {
  breakdown?: EarningsBreakdownItem[];
}

/** Horizontal bar breakdown of where creator earnings come from, animating its fill in on mount. */
export default function EarningsChart({ breakdown = DEFAULT_BREAKDOWN }: EarningsChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="mt-4 flex flex-col gap-4">
      {breakdown.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between font-noto text-xs text-muted">
            <span className="font-syne font-semibold text-text">{item.label}</span>
            <span>{item.percent}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: mounted ? `${item.percent}%` : 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${item.color}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
