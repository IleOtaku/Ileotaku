"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { createFeedback } from "@/lib/admin";
import { logError } from "@/lib/errorLogger";
import type { BetaFeedbackType } from "@/types";

const BETA_CUTOFF = new Date("2025-11-01");

const TYPES: { value: BetaFeedbackType; label: string }[] = [
  { value: "bug", label: "🐛 Bug" },
  { value: "suggestion", label: "💡 Suggestion" },
  { value: "compliment", label: "👏 Compliment" },
];

/** Floating "Feedback" pill, visible on every page during the beta window — opens a short modal
 * that writes straight to the betaFeedback collection (see lib/admin.ts's createFeedback and the
 * admin dashboards' Feedback tab, which triages what comes in). Auto-hides for good after the
 * beta window closes, no env var or flag needed to turn it off later. */
export default function BetaFeedback() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BetaFeedbackType | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (new Date() > BETA_CUTOFF) return null;

  function reset() {
    setType(null);
    setDescription("");
    setSubmitted(false);
  }

  function handleClose() {
    setOpen(false);
    // Wait out the modal's own close transition before wiping the form, so it doesn't visibly
    // reset itself while still fading out.
    setTimeout(reset, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || description.trim().length < 10) return;
    setSubmitting(true);
    try {
      await createFeedback({
        type,
        description: description.trim(),
        page: pathname ?? "/",
        uid: user?.uid ?? null,
        email: profile?.email ?? null,
      });
      setSubmitted(true);
      setTimeout(handleClose, 2000);
    } catch (error) {
      await logError(error, { operation: "BetaFeedback.handleSubmit" });
      toast.error("Couldn't submit your feedback. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-clay to-gold px-4 py-2.5 font-syne text-sm font-bold text-ivory shadow-lg transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
      >
        <span aria-hidden="true">💬</span>
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Modal open={open} onClose={handleClose} title="Beta Feedback">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green2" />
            <p className="font-noto text-sm text-text">
              Thank you! We read every piece of feedback. 🙏
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Type</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors ${
                      type === t.value
                        ? "border-clay bg-clay text-ivory"
                        : "border-muted2 bg-bg3 text-muted hover:text-text"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Description</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
              disabled={submitting || !type || description.trim().length < 10}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Feedback
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
