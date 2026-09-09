"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, RotateCcw } from "lucide-react";
import { resubmitWorkForReview } from "@/lib/admin";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import { formatTime } from "@/lib/utils";
import type { CreatorWork } from "@/types";

export interface RejectedWorkCardProps {
  work: CreatorWork;
  authorName: string;
  onResolved: (workId: string) => void;
}

/** A rejected work — shows the moderator's reason, with an option to send it back for another look. */
export default function RejectedWorkCard({ work, authorName, onResolved }: RejectedWorkCardProps) {
  const [saving, setSaving] = useState(false);

  async function handleReReview() {
    setSaving(true);
    try {
      await resubmitWorkForReview(work.id);
      toast.success("Sent back to the pending queue.");
      onResolved(work.id);
    } catch {
      toast.error("Couldn't re-queue this work.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-4 sm:flex-row">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-bg3 opacity-70">
        {work.coverURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy" src={getOptimizedImageUrl(work.coverURL, 200)} alt={work.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-cinzel text-xl text-muted">
            {work.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1">
        <h3 className="font-syne text-sm font-semibold text-text">{work.title}</h3>
        <p className="font-noto text-xs text-muted">by {authorName}</p>
        {work.rejectionReason && (
          <p className="mt-2 rounded-lg border border-dashed border-clay2/40 bg-clay/5 p-2 font-noto text-xs text-clay2">
            {work.rejectionReason}
          </p>
        )}
        <p className="mt-2 font-noto text-[11px] text-muted">Rejected {formatTime(work.updatedAt)}</p>
      </div>

      <div className="flex shrink-0 items-start">
        <button
          type="button"
          onClick={handleReReview}
          disabled={saving}
          className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Re-review
        </button>
      </div>
    </div>
  );
}
