import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Globe2, Heart, ShieldCheck } from "lucide-react";
import { SectionEyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "About",
};

const VALUES = [
  {
    icon: Globe2,
    title: "African Stories, First-Class",
    text: "A dedicated home — not an afterthought category — for manga, manhwa, and comics written, drawn, and lettered by African creators.",
  },
  {
    icon: ShieldCheck,
    title: "Creators Keep Their Rights",
    text: "Every submission is fingerprinted and monitored. Creators retain full copyright; ÍléOtaku only holds a license to distribute.",
  },
  {
    icon: Heart,
    title: "Fair, Transparent Revenue",
    text: "Creators keep the majority of every coin, ad, and Platinum read their work earns, with monthly payouts and clear reporting.",
  },
  {
    icon: BookOpen,
    title: "A Real Reading Experience",
    text: "Fast, ad-light reading with real chapter unlocks, offline downloads, and reading tools built for people who actually read manga daily.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <SectionEyebrow>Our Story</SectionEyebrow>
        <h1 className="font-cinzel text-3xl text-text sm:text-4xl">About ÍléOtaku</h1>
        <p className="mx-auto mt-4 max-w-2xl font-noto text-sm leading-relaxed text-muted">
          ÍléOtaku (&ldquo;Home of the Otaku&rdquo;) is a manga and manhwa reading platform built around a
          simple idea: African creators deserve the same stage as any other catalog, not a
          sidebar. We bring together a global manga library and a dedicated home for African
          Originals — stories written, drawn, and lettered by creators across the continent —
          under one roof, with a fair, transparent path for those creators to actually earn a
          living from their work.
        </p>
      </div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        {VALUES.map((v) => (
          <div key={v.title} className="rounded-2xl border border-bg4 bg-bg2 p-6">
            <v.icon className="h-5 w-5 text-gold" />
            <p className="mt-3 font-syne text-sm font-semibold text-text">{v.title}</p>
            <p className="mt-1.5 font-noto text-xs leading-relaxed text-muted">{v.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-col items-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-br from-clay/10 via-bg2 to-gold/10 p-8 text-center">
        <p className="font-cinzel text-xl text-text">Want to publish with us?</p>
        <p className="max-w-md font-noto text-sm text-muted">
          Join our growing roster of African creators and reach readers across 54 countries.
        </p>
        <Link href="/creator" className="btn-primary mt-2">
          Become a Creator
        </Link>
      </div>
    </div>
  );
}
