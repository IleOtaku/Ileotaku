"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { Bug, CheckCircle2, Lightbulb, Loader2, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { createFeedback } from "@/lib/admin";
import { logError } from "@/lib/errorLogger";
import type { BetaFeedbackType } from "@/types";

export const BETA_FEEDBACK_CUTOFF = new Date("2026-11-01");

// Beta feedback UI/UX: "Everywhere that emoji were used instead of icons should be changed to
// icons" — these type-selector labels were structural chrome, not user content, so in scope.
const FEEDBACK_TYPES: { value: BetaFeedbackType; label: string; icon: LucideIcon }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "suggestion", label: "Suggestion", icon: Lightbulb },
  { value: "compliment", label: "Compliment", icon: ThumbsUp },
];

export interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The one beta feedback form used everywhere it's offered — the footer's "Send Feedback" link,
 * Profile → Settings' "Beta Feedback" section, and ShakeReporter's shake-to-open gesture all open
 * this exact same modal, rather than each keeping its own copy. Type chips, a description, the
 * current page auto-filled, submits to the betaFeedback collection, same success state either way.
 */
export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const [type, setType] = useState<BetaFeedbackType | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function reset() {
    setType(null);
    setDescription("");
    setSubmitted(false);
  }

  function handleClose() {
    onClose();
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
      await logError(error, { operation: "FeedbackModal.handleSubmit" });
      toast.error("Couldn't submit your feedback. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Beta Feedback">
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-green2" />
          <p className="font-noto text-sm text-text">Thank you! We read every piece of feedback. 🙏</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Type</p>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors ${
                    type === t.value
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
  );
}
