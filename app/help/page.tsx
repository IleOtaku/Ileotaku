import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { SectionEyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "Help Center",
};

const FAQS = [
  {
    q: "How do I unlock a chapter with coins?",
    a: "Open the chapter — if it's beyond a title's free chapters, you'll see a coin-price overlay. Tap Unlock to spend coins from your balance, or watch a short ad on chapters that offer that option instead. Platinum members never see a lock on imported titles.",
  },
  {
    q: "What does Platinum include?",
    a: "Zero ads, unlimited chapter unlocks, offline downloads, HD image quality, 5 reading themes, early access to new chapters, a custom profile tagline, and a Platinum badge across the app. See the Pricing page for the full comparison.",
  },
  {
    q: "How do I become a creator and publish my own series?",
    a: "Visit the Creator Studio from the Navbar, activate your creator account, then use Upload New Work to submit a title for review. Our editorial team typically reviews submissions within 5-7 business days.",
  },
  {
    q: "How do creator earnings and payouts work?",
    a: "You earn from reads, tips, and Platinum subscriptions to your published work. Earnings are calculated monthly and paid out within 15 days of month-end — track them anytime from your Creator Studio's Earnings tab.",
  },
  {
    q: "How do I buy coins?",
    a: "Go to Pricing and choose a coin package under Buy Coins. Coins are used to unlock chapters, tip creators, boost feed posts, and spin the daily coin roulette.",
  },
  {
    q: "I forgot my password / can't log in — what do I do?",
    a: "Use the Forgot Password link on the sign-in page to receive a reset email. If you signed up with Google, use the Continue with Google button instead of a password.",
  },
  {
    q: "How do I change my reading theme or offline downloads?",
    a: "Open the reader toolbar's theme icon for Dark/Sepia (free) or Midnight/Sakura/Matrix (Platinum). Downloads for offline reading are available to Platinum members from any chapter's menu, and appear under your Library's Downloads tab.",
  },
  {
    q: "How do I report a user, comment, or piece of content?",
    a: "Every profile, comment, and series page has a Report option. Reports go straight to our Trust & Safety team for review — you can also block a user directly from their profile to stop seeing or receiving messages from them.",
  },
  {
    q: "Can I delete my account?",
    a: "Yes — go to Profile → Settings → Account and choose Delete Account. This permanently removes your profile and data; it can't be undone, so make sure it's what you want first.",
  },
  {
    q: "How do referrals work?",
    a: "Share your referral link from your profile — when someone signs up using it, you both receive a coin bonus once their account is created.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <SectionEyebrow>Help Center</SectionEyebrow>
        <h1 className="font-cinzel text-3xl text-text sm:text-4xl">Frequently Asked Questions</h1>
        <p className="mx-auto mt-3 max-w-xl font-noto text-sm text-muted">
          Answers to the most common questions about reading, coins, Platinum, and publishing on
          ÍléOtaku.
        </p>
      </div>

      <div className="mt-12 flex flex-col gap-3">
        {FAQS.map((faq) => (
          <details
            key={faq.q}
            className="group rounded-2xl border border-bg4 bg-bg2 p-5 open:border-gold/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-syne text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
              {faq.q}
              <span className="shrink-0 font-cinzel text-lg text-gold transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 font-noto text-sm leading-relaxed text-muted">{faq.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl border border-bg4 bg-bg2 p-8 text-center">
        <Mail className="h-6 w-6 text-gold" />
        <p className="font-syne text-sm font-semibold text-text">Still need help?</p>
        <p className="max-w-sm font-noto text-xs text-muted">
          Our support team is happy to help with anything not covered above.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <a href="mailto:hello@ileotaku.com" className="btn-primary">
            hello@ileotaku.com
          </a>
          <Link href="/contact" className="btn-ghost">
            Contact Form
          </Link>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-noto text-xs text-muted">
        <Link href="/about" className="hover:text-gold hover:underline">
          About
        </Link>
        <Link href="/privacy" className="hover:text-gold hover:underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-gold hover:underline">
          Terms of Service
        </Link>
        <Link href="/creator-agreement" className="hover:text-gold hover:underline">
          Creator Agreement
        </Link>
        <Link href="/cookies" className="hover:text-gold hover:underline">
          Cookie Policy
        </Link>
      </div>
    </div>
  );
}
