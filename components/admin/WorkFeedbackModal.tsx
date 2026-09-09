"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";

export interface WorkFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  submitting: boolean;
  onSubmit: (feedback: string) => void;
}

/** Shared textarea-feedback modal for both "Reject" and "Request Changes" — the only
 * difference between those two actions is which lib/admin.ts function the caller passes in. */
export default function WorkFeedbackModal({
  open,
  onClose,
  title,
  confirmLabel,
  submitting,
  onSubmit,
}: WorkFeedbackModalProps) {
  const [feedback, setFeedback] = useState("");

  function handleSubmit() {
    if (!feedback.trim()) return;
    onSubmit(feedback.trim());
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={4}
        placeholder="Explain what needs to change — this is sent directly to the creator."
        className="input-base w-full resize-none"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !feedback.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-red-500 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
