"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { Bug, CheckCircle2, Lightbulb, Loader2, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { createFeedback } from "@/lib/admin";
import { logError } from "@/lib/errorLogger";
import type { BetaFeedbackType } from "@/types";
import BugReportModal from "./BugReportModal";

const BETA_CUTOFF = new Date("2026-11-01");

// Beta feedback UI/UX: "Everywhere that emoji were used instead of icons should be changed to
// icons" — these type-selector labels were structural chrome, not user content, so in scope.
const FEEDBACK_TYPES: { value: BetaFeedbackType; label: string; icon: LucideIcon }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "suggestion", label: "Suggestion", icon: Lightbulb },
  { value: "compliment", label: "Compliment", icon: ThumbsUp },
];

const EXPLORE_LINKS = [
  { label: "Browse Manga", href: "/reader" },
  { label: "Explore", href: "/explore" },
  { label: "New Releases", href: "/explore#new-releases" },
  { label: "Pricing", href: "/pricing" },
  // Beta feedback (PART 9) asked for this under a "Community" column — the footer's grid is a
  // fixed 4 columns (brand + 3 link lists) with none currently named that, so a 5th column would
  // break the layout; Explore is the closest existing fit for a store other users' content lives
  // in.
  { label: "Sticker Store", href: "/stickers" },
];

const CREATOR_LINKS = [
  { label: "Become a Creator", href: "/creator" },
  { label: "Creator Dashboard", href: "/creator" },
  { label: "Submission Guidelines", href: "/creator" },
  { label: "Payouts", href: "/creator" },
];

const COMPANY_LINKS = [
  { label: "About", href: "/about" },
  { label: "Help Center", href: "/help" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Creator Agreement", href: "/creator-agreement" },
  { label: "Cookie Policy", href: "/cookies" },
];

/** Four-column site footer: brand + tagline, then Explore / Creators / Company link columns. */
export default function Footer() {
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const { user, profile } = useAuth();
  const pathname = usePathname();

  // Beta feedback: "Remove floating feedback button, add to footer" — this used to be
  // BetaFeedback.tsx's own floating pill (draggable on mobile, visible on every page). A footer
  // link only ever shows on pages that render the footer at all (SiteChrome's immersive routes —
  // /messages, /feed, /reader, etc. — never did), which is the accepted tradeoff of moving it here.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<BetaFeedbackType | null>(null);
  const [feedbackDescription, setFeedbackDescription] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const feedbackWindowOpen = new Date() <= BETA_CUTOFF;

  function resetFeedbackForm() {
    setFeedbackType(null);
    setFeedbackDescription("");
    setFeedbackSubmitted(false);
  }

  function closeFeedbackModal() {
    setFeedbackOpen(false);
    // Wait out the modal's own close transition before wiping the form, so it doesn't visibly
    // reset itself while still fading out.
    setTimeout(resetFeedbackForm, 200);
  }

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackType || feedbackDescription.trim().length < 10) return;
    setFeedbackSubmitting(true);
    try {
      await createFeedback({
        type: feedbackType,
        description: feedbackDescription.trim(),
        page: pathname ?? "/",
        uid: user?.uid ?? null,
        email: profile?.email ?? null,
      });
      setFeedbackSubmitted(true);
      setTimeout(closeFeedbackModal, 2000);
    } catch (error) {
      await logError(error, { operation: "Footer.handleFeedbackSubmit" });
      toast.error("Couldn't submit your feedback. Please try again.");
      setFeedbackSubmitting(false);
    }
  }

  return (
    <footer className="border-t border-bg4 bg-bg2">
      <div className="kente-bar" />
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="flex items-center gap-2 font-cinzel text-xl font-bold text-gold">
            <Image src="/icons/icon-32.png" alt="ÍléOtaku" width={28} height={28} className="h-6 w-6 rounded-md md:h-7 md:w-7" />
            Ílé<span className="text-clay">Otaku</span>
          </Link>
          <p className="mt-3 max-w-xs font-noto text-sm text-muted">
            Born from the Motherland — Africa&apos;s home for manga and comics, in every language,
            for every reader.
          </p>
        </div>

        <div>
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Explore</h3>
          <ul className="flex flex-col gap-2">
            {EXPLORE_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="font-noto text-sm text-muted transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Creators</h3>
          <ul className="flex flex-col gap-2">
            {CREATOR_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="font-noto text-sm text-muted transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 font-syne text-sm font-semibold text-text">Company</h3>
          <ul className="flex flex-col gap-2">
            {COMPANY_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="font-noto text-sm text-muted transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setBugModalOpen(true)}
                className="font-noto text-sm text-muted transition-colors hover:text-gold"
              >
                Report a Bug
              </button>
            </li>
            {feedbackWindowOpen && (
              <li>
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="text-left font-noto text-sm text-muted/60 transition-colors hover:text-muted"
                >
                  Send Feedback
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>

      <BugReportModal open={bugModalOpen} onClose={() => setBugModalOpen(false)} />

      <Modal open={feedbackOpen} onClose={closeFeedbackModal} title="Beta Feedback">
        {feedbackSubmitted ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green2" />
            <p className="font-noto text-sm text-text">Thank you! We read every piece of feedback. 🙏</p>
          </div>
        ) : (
          <form onSubmit={handleFeedbackSubmit} className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Type</p>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setFeedbackType(t.value)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors ${
                      feedbackType === t.value
                        ? "border-clay bg-clay text-ivory"
                        : "border-muted2 bg-bg3 text-muted hover:text-text"
                    }`}
                  >
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Description</p>
              <textarea
                value={feedbackDescription}
                onChange={(e) => setFeedbackDescription(e.target.value)}
                rows={4}
                required
                minLength={10}
                placeholder="Tell us what you found..."
                className="input-base resize-none text-sm"
              />
            </div>

            <p className="font-noto text-xs text-muted">Page: {pathname}</p>

            <button
              type="submit"
              disabled={feedbackSubmitting || !feedbackType || feedbackDescription.trim().length < 10}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {feedbackSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Feedback
            </button>
          </form>
        )}
      </Modal>

      <div className="border-t border-bg4 px-4 py-4 text-center font-noto text-xs text-muted sm:px-6">
        <p>© {new Date().getFullYear()} ÍléOtaku. All rights reserved.</p>
        <p className="mt-1">
          Every story on ÍléOtaku is published by{" "}
          <Link href="/creator" className="transition-colors hover:text-gold">
            our creators
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
