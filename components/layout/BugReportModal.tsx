"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { submitBugReport } from "@/lib/admin";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

export interface BugReportModalProps {
  open: boolean;
  onClose: () => void;
}

/** Footer's "Report a Bug" modal — title, description, repro steps, expected/actual behavior,
 * with browser info auto-filled from navigator.userAgent. Works for signed-out visitors too. */
export default function BugReportModal({ open, onClose }: BugReportModalProps) {
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setSteps("");
    setExpected("");
    setActual("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await submitBugReport({
        title: title.trim(),
        description: description.trim(),
        ...(steps.trim() ? { stepsToReproduce: steps.trim() } : {}),
        ...(expected.trim() ? { expectedBehavior: expected.trim() } : {}),
        ...(actual.trim() ? { actualBehavior: actual.trim() } : {}),
        browserInfo: typeof navigator !== "undefined" ? navigator.userAgent : "Unknown",
        ...(user ? { reportedBy: user.uid, reportedByName: profile?.displayName ?? user.displayName ?? "Reader" } : {}),
      });
      toast.success("Bug reported — thank you! 🐛");
      reset();
      onClose();
    } catch {
      toast.error("Couldn't submit your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Report a Bug">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title (e.g. Comment box won't submit)"
          className="input-base text-sm"
          required
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What happened?"
          className="input-base resize-none text-sm"
          required
        />
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={2}
          placeholder="Steps to reproduce (optional)"
          className="input-base resize-none text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <textarea
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            rows={2}
            placeholder="Expected behavior (optional)"
            className="input-base resize-none text-sm"
          />
          <textarea
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            rows={2}
            placeholder="Actual behavior (optional)"
            className="input-base resize-none text-sm"
          />
        </div>
        <p className="font-noto text-[11px] text-muted">
          Your browser info will be attached automatically to help us reproduce this.
        </p>
        <button
          type="submit"
          disabled={submitting || !title.trim() || !description.trim()}
          className="btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit Report
        </button>
      </form>
    </Modal>
  );
}
