"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { approveWork, rejectWork, requestWorkChanges } from "@/lib/admin";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import { formatTime } from "@/lib/utils";
import type { CreatorWork } from "@/types";
import WorkFeedbackModal from "./WorkFeedbackModal";

export interface PendingWorkCardProps {
  work: CreatorWork;
  authorName: string;
  onResolved: (workId: string) => void;
}

type Processing = "approve" | "reject" | "changes" | null;

/** One pending submission awaiting admin review — Approve / Reject (feedback modal) /
 * Request Changes (feedback modal, stays in the pending queue with a note attached). */
export default function PendingWorkCard({ work, authorName, onResolved }: PendingWorkCardProps) {
  const [processing, setProcessing] = useState<Processing>(null);
  const [modal, setModal] = useState<"reject" | "changes" | null>(null);

  async function handleApprove() {
    setProcessing("approve");
    try {
      await approveWork(work.id, work.creatorId, work.title);
      toast.success("Work approved.");
      onResolved(work.id);
    } catch {
      toast.error("Couldn't approve this work. Please try again.");
      setProcessing(null);
    }
  }

  async function handleReject(feedback: string) {
    setProcessing("reject");
    try {
      await rejectWork(work.id, work.creatorId, work.title, feedback);
      toast.success("Work rejected — the creator has been notified.");
      setModal(null);
      onResolved(work.id);
    } catch {
      toast.error("Couldn't reject this work. Please try again.");
      setProcessing(null);
    }
  }

  async function handleRequestChanges(feedback: string) {
    setProcessing("changes");
    try {
      await requestWorkChanges(work.id, work.creatorId, work.title, feedback);
      toast.success("Change request sent to the creator.");
      setModal(null);
      // Not resolved — it stays in the pending queue. Just clear the busy state.
      setProcessing(null);
    } catch {
      toast.error("Couldn't send this request. Please try again.");
      setProcessing(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-4 sm:flex-row">
      <div className="h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-bg3">
        {work.coverURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy" src={getOptimizedImageUrl(work.coverURL, 200)} alt={work.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-cinzel text-2xl text-muted">
            {work.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1">
        <h3 className="font-syne text-base font-semibold text-text">{work.title}</h3>
        <p className="font-noto text-xs text-muted">by {authorName}</p>
        <p className="mt-2 line-clamp-2 font-noto text-sm text-muted">{work.description}</p>
        {work.genres.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {work.genres.map((g) => (
              <span key={g} className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[10px] text-muted">
                {g}
              </span>
            ))}
          </div>
        )}
        {work.rejectionReason && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-dashed border-gold/40 bg-gold/5 p-2 font-noto text-xs text-gold">
            <MessageSquareWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Changes requested: {work.rejectionReason}
          </p>
        )}
        <p className="mt-2 font-noto text-[11px] text-muted">Submitted {formatTime(work.createdAt)}</p>
      </div>

      <div className="flex shrink-0 gap-2 sm:flex-col">
        <button
          type="button"
          onClick={handleApprove}
          disabled={processing !== null}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-green px-4 py-2 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-green2 disabled:opacity-50"
        >
          {processing === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Approve
        </button>
        <button
          type="button"
          onClick={() => setModal("changes")}
          disabled={processing !== null}
          className="btn-ghost text-sm disabled:opacity-50"
        >
          Request Changes
        </button>
        <button
          type="button"
          onClick={() => setModal("reject")}
          disabled={processing !== null}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-red-500 disabled:opacity-50"
        >
          {processing === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Reject
        </button>
      </div>

      <WorkFeedbackModal
        open={modal === "reject"}
        onClose={() => setModal(null)}
        title="Reject this work"
        confirmLabel="Reject & Notify"
        submitting={processing === "reject"}
        onSubmit={handleReject}
      />
      <WorkFeedbackModal
        open={modal === "changes"}
        onClose={() => setModal(null)}
        title="Request changes"
        confirmLabel="Send Request"
        submitting={processing === "changes"}
        onSubmit={handleRequestChanges}
      />
    </div>
  );
}
