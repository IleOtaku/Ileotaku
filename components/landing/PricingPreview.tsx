import Link from "next/link";
import { Check, Coins, Crown, Sparkles } from "lucide-react";
import Reveal from "./Reveal";

const PLANS = [
  {
    icon: Sparkles,
    name: "Free",
    price: "$0",
    period: "forever",
    accent: "text-text",
    features: [
      "Access to the full free catalog",
      "Read in 30+ languages",
      "Follow your favorite creators",
      "Community chat",
    ],
    cta: { label: "Start Free", href: "/auth/signup" },
    featured: false,
  },
  {
    icon: Crown,
    name: "Platinum",
    price: "$4.99",
    period: "/month",
    accent: "text-plat2",
    features: [
      "Everything in Free",
      "Ad-free reading",
      "Early access to new chapters",
      "Exclusive Platinum-only titles",
    ],
    cta: { label: "Go Platinum", href: "/pricing" },
    featured: true,
  },
  {
    icon: Coins,
    name: "Coins",
    price: "Pay as you go",
    period: "",
    accent: "text-gold2",
    features: [
      "Unlock premium chapters",
      "Tip your favorite creators",
      "No subscription required",
      "Bundles from $1.99",
    ],
    cta: { label: "Buy Coins", href: "/pricing" },
    featured: false,
  },
];

export default function PricingPreview() {
  return (
    <section className="bg-bg2 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-clay" />
              <span className="font-syne text-xs font-bold uppercase tracking-[0.2em] text-gold">
                Pricing
              </span>
            </div>
            <h2 className="font-cinzel text-2xl text-text sm:text-3xl">Read your way</h2>
          </div>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <div
                className={`flex h-full flex-col rounded-2xl border p-6 ${
                  plan.featured ? "border-gold bg-bg3" : "border-bg4 bg-bg3/60"
                }`}
              >
                <plan.icon className={`h-6 w-6 ${plan.accent}`} />
                <h3 className="mt-3 font-syne text-lg font-bold text-text">{plan.name}</h3>
                <p className="mt-1 font-cinzel text-2xl text-text">
                  {plan.price}
                  <span className="ml-1 font-noto text-xs text-muted">{plan.period}</span>
                </p>
                <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 font-noto text-sm text-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green2" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.cta.href}
                  className={
                    plan.featured ? "btn-gold mt-6 justify-center" : "btn-ghost mt-6 justify-center"
                  }
                >
                  {plan.cta.label}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
