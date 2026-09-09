"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

export interface RevealProps {
  children: ReactNode;
  delay?: number;
}

/** Wraps a section's content so it fades and slides up into view as the viewer scrolls to it. */
export default function Reveal({ children, delay = 0 }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
