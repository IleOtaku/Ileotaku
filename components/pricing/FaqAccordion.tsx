"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Can I cancel Platinum anytime?",
    a: "Yes — cancel anytime from your profile settings and you'll keep Platinum until the end of your current billing period.",
  },
  { q: "Do coins expire?", a: "No. Coins you buy stay in your account until you spend them." },
  {
    q: "What happens to my library if I cancel Platinum?",
    a: "Everything you've bookmarked or unlocked with coins stays yours — you just go back to reading at the free tier's pace.",
  },
  {
    q: "Is Platinum available in my country?",
    a: "Yes — ÍléOtaku is available everywhere. Checkout charges in Nigerian Naira (₦) via Paystack, with an approximate USD equivalent shown for reference; your bank or card network converts to your local currency automatically.",
  },
  {
    q: "How do creators get paid?",
    a: "A share of every coin, ad impression and Platinum subscription is pooled monthly and paid out directly to the creators readers actually read.",
  },
  {
    q: "Can I switch between Monthly and Annual billing?",
    a: "Yes, anytime from your profile's Membership card — the change applies at your next renewal.",
  },
  {
    q: "What payment methods are supported?",
    a: "Card and mobile money payments via Paystack, supporting major African payment providers.",
  },
  {
    q: "Is there a free trial for Platinum?",
    a: "New accounts get a taste of Platinum features during their first week — no card required.",
  },
];

/** FAQ accordion with a smooth height/opacity expand-collapse animation. */
export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <h2 className="font-cinzel text-2xl text-text sm:text-3xl">Frequently asked questions</h2>
        </div>

        <div className="flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.q} className="rounded-xl border border-bg4 bg-bg2">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-syne text-sm font-semibold text-text">{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 font-noto text-sm text-muted">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
