import Link from "next/link";
import { ArrowRight, BadgeCheck, LineChart, ShieldCheck, Wallet } from "lucide-react";
import { SectionEyebrow } from "@/components/ui";
import EarningsChart from "@/components/creator/EarningsChart";
import Reveal from "./Reveal";

const FEATURE_CHIPS = [
  { icon: ShieldCheck, label: "Copyright Protection" },
  { icon: LineChart, label: "Analytics" },
  { icon: Wallet, label: "Revenue Share" },
  { icon: BadgeCheck, label: "Editorial Support" },
];

export default function CreatorSection() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <SectionEyebrow>For Creators</SectionEyebrow>
          <h2 className="font-cinzel text-2xl text-text sm:text-3xl">Your stories. Your revenue.</h2>
          <p className="mt-4 max-w-md font-noto text-sm text-muted">
            Publish directly to millions of readers across the continent and keep earning as your
            series grows — with full copyright protection and transparent payouts.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {FEATURE_CHIPS.map((chip) => (
              <div
                key={chip.label}
                className="flex items-center gap-2 rounded-xl border border-bg4 bg-bg2 px-3 py-2.5"
              >
                <chip.icon className="h-4 w-4 text-gold" />
                <span className="font-syne text-xs font-semibold text-text">{chip.label}</span>
              </div>
            ))}
          </div>

          <Link href="/creator" className="btn-primary mt-8 inline-flex">
            Become a Creator <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="glass rounded-2xl p-6">
            <p className="font-syne text-xs uppercase tracking-[0.2em] text-muted">
              Where every coin goes
            </p>
            <EarningsChart />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
