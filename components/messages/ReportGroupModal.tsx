"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { CircleCheckBig, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { submitGroupReport } from "@/lib/groupReports";
import type { Conversation, GroupReportReason } from "@/types";

export interface ReportGroupModalProps {
  open: boolean;
  onClose: () => void;
  conversation: Pick<Conversation, "id" | "name" | "photoURL" | "participantNames">;
}

const REASONS: { label: string; value: GroupReportReason }[] = [
  { label: "Spam", value: "spam" },
  { label: "Harassment", value: "harassment" },
  { label: "Inappropriate content", value: "inappropriate" },
  { label: "Underage content", value: "underage" },
  { label: "Other", value: "other" },
];

/** Beta feedback: "Add a gc report feature that sends main admin and/or sub admins the report and
 * shows the last 15 messages sent on the group." submitGroupReport() (lib/groupReports.ts)
 * captures those 15 messages automatically — nothing for the reporter to do but pick a reason. */
export default function ReportGroupModal({ open, onClose, conversation }: ReportGroupModalProps) {
  const { user, profile } = useAuth();
  const [reason, setReason] = useState<GroupReportReason>("spam");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    onClose();
    setTimeout(() => {
      setSubmitted(false);
      setReason("spam");
      setDescription("");
    }, 200);
  }

  async function handleSubmit() {
    if (!user) return;
    setSubmitting(true);
    try {
      await submitGroupReport(
        conversation,
        { uid: user.uid, displayName: profile?.displayName ?? user.displayName ?? "A member" },
        reason,
        description
      );
      setSubmitted(true);
    } catch {
      toast.error("Couldn't submit this report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // Beta feedback bug: "When i click report group, the groupchat about panel stops me from
    // tapping it, and when i tap it, it goes and takes the report panel along." Modal's default
    // z-index (100) sits BELOW GroupInfoPanel's own backdrop/slide-in panel (z-[130]/z-[131]), so
    // this modal was rendering behind it — taps landed on GroupInfoPanel instead, including its
    // backdrop's onClose, which unmounts GroupInfoPanel and (since this modal lives inside its
    // JSX tree) this modal right along with it.
    <Modal open={open} onClose={handleClose} title={submitted ? undefined : "Report Group"} zIndex={140}>
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CircleCheckBig className="h-10 w-10 text-green2" />
          <h3 className="font-cinzel text-lg text-text">Report sent</h3>
          <p className="font-noto text-sm text-muted">Our moderation team will review this group, including its recent messages.</p>
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
                  name="group-report-reason"
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
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What's happening in this group?"
              className="input-base resize-none"
            />
          </div>

          <p className="font-noto text-xs text-muted">
            The last 15 messages sent in this group will be included automatically, so reviewers have the context they need.
          </p>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !description.trim()}
            className="btn-primary w-full justify-center disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Report"}
          </button>
        </div>
      )}
    </Modal>
  );
}
