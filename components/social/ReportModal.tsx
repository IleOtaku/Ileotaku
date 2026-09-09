"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { CircleCheckBig, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { blockUser } from "@/lib/blocking";
import { submitReport } from "@/lib/firestore";
import type { ReportReason, ReportTargetType } from "@/types";

export interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** The uid of the person being reported, when known — lets a moderator action them directly. */
  targetUserId?: string;
}

const REASONS: { label: string; value: ReportReason }[] = [
  { label: "Spam", value: "spam" },
  { label: "Harassment", value: "harassment" },
  { label: "Inappropriate content", value: "inappropriate" },
  { label: "Copyright violation", value: "copyright" },
  { label: "Underage content", value: "underage" },
  { label: "Other", value: "other" },
];

/** Content-reporting modal, reusable across comments, chapters, series, profiles, and DMs. */
export default function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  targetUserId,
}: ReportModalProps) {
  const { user, profile } = useAuth();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    onClose();
    // Reset after the close animation finishes so the form doesn't visibly flash back to blank.
    setTimeout(() => {
      setSubmitted(false);
      setReason("spam");
      setDetails("");
      setAlsoBlock(false);
    }, 200);
  }

  async function handleSubmit() {
    if (!user) {
      toast.error("Sign in to report this.");
      return;
    }
    setSubmitting(true);
    try {
      await submitReport({
        reporterId: user.uid,
        reporterName: profile?.displayName ?? user.displayName ?? "A reader",
        targetType,
        targetId,
        ...(targetUserId ? { targetUserId } : {}),
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        reporterIsPlatinum: profile?.isPlatinum === true,
      });
      if (alsoBlock && targetUserId) {
        try {
          await blockUser(user.uid, targetUserId);
        } catch {
          toast.error("Report sent, but blocking this user failed.");
        }
      }
      setSubmitted(true);
    } catch {
      toast.error("Couldn't submit your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={submitted ? undefined : "Report content"}>
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CircleCheckBig className="h-10 w-10 text-green2" />
          <h3 className="font-cinzel text-lg text-text">Thank you</h3>
          <p className="font-noto text-sm text-muted">
            Your report has been sent to our moderation team for review.
          </p>
          <button type="button" onClick={handleClose} className="btn-ghost mt-2">
            Close
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-bg4 bg-bg3 px-3 py-2.5 transition-colors hover:border-clay"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-4 w-4 accent-clay"
                />
                <span className="font-noto text-sm text-text">{r.label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              Details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Anything else that would help us review this?"
              className="input-base resize-none"
            />
          </div>

          {targetUserId && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-bg4 bg-bg3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                className="h-4 w-4 accent-clay"
              />
              <span className="font-noto text-sm text-text">Block this user</span>
            </label>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full justify-center"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Report"}
          </button>
        </div>
      )}
    </Modal>
  );
}
