"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const STATS = [
  { value: "100%", label: "Creator-Owned" },
  { value: "180+", label: "Creators" },
  { value: "54", label: "Countries" },
  { value: "30", label: "Languages" },
];

interface FloatingCard {
  title: string;
  color: string;
  rotate: number;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
}

// Purely decorative — labeled by format, not by any specific (real or placeholder) title, since
// this hero renders for every visitor regardless of what's actually been published yet.
const FLOATING_CARDS: FloatingCard[] = [
  { title: "Manga", color: "from-clay to-clay2", rotate: -8, top: "6%", left: "4%" },
  { title: "Manhwa", color: "from-green to-green2", rotate: 6, top: "16%", right: "3%" },
  { title: "Prose", color: "from-gold to-gold2", rotate: -4, bottom: "10%", left: "9%" },
  { title: "Original", color: "from-plat to-plat2", rotate: 10, bottom: "5%", right: "7%" },
];

/** Landing hero: full pitch for logged-out visitors, a personalised "keep reading" prompt for members. */
export default function Hero() {
  const { user, profile, loading } = useAuth();

  if (!loading && user) {
    return (
      <section className="relative overflow-hidden bg-bg px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-syne text-sm uppercase tracking-[0.25em] text-gold">Welcome back</p>
          <h1 className="mt-3 font-cinzel text-3xl text-text sm:text-4xl">
            {profile?.displayName ?? user.displayName ?? "Reader"}, your next chapter is waiting.
          </h1>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/reader" className="btn-primary">
              Continue Reading <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden bg-bg px-4 pb-24 pt-20 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, #c4622d, transparent 40%), radial-gradient(circle at 85% 15%, #3d6b4f, transparent 40%), radial-gradient(circle at 50% 90%, #d4a843, transparent 35%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-syne text-sm uppercase tracking-[0.25em] text-gold"
        >
          Africa&apos;s Manga &amp; Comics Platform
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 font-cinzel text-4xl font-bold leading-tight text-text sm:text-5xl md:text-6xl"
        >
          Stories Born From <span className="text-gold">the Motherland</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mx-auto mt-5 max-w-xl font-noto text-base text-muted sm:text-lg"
        >
          Read, create and connect over manga and comics made by African storytellers, in the
          languages of home.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <Link href="/auth/signup" className="btn-primary">
            Start Reading Free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/reader" className="btn-ghost">
            <Play className="h-4 w-4" /> Explore the Catalog
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mx-auto mt-14 grid max-w-lg grid-cols-4 gap-4 border-t border-bg4 pt-8"
        >
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="font-cinzel text-xl text-gold sm:text-2xl">{stat.value}</p>
              <p className="font-noto text-xs text-muted">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        {FLOATING_CARDS.map((card, i) => (
          <motion.div
            key={card.title}
            className={`glass absolute w-36 rounded-xl bg-gradient-to-br p-3 shadow-lg ${card.color}`}
            style={{
              top: card.top,
              left: card.left,
              right: card.right,
              bottom: card.bottom,
              rotate: card.rotate,
            }}
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="aspect-[3/4] w-full rounded-lg bg-bg/40" />
            <p className="mt-2 truncate font-syne text-xs font-semibold text-ivory">{card.title}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
