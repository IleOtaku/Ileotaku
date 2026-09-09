"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ReportTargetType } from "@/types";
import ReportModal from "./ReportModal";

export interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string;
  label?: string;
  /** Compact icon-only style for tight toolbars (e.g. next to a creator's other actions). */
  compact?: boolean;
}

/** Small reusable report trigger — owns its own modal state, usable on any page. */
export default function ReportButton({
  targetType,
  targetId,
  targetUserId,
  label = "Report",
  compact,
}: ReportButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex items-center gap-1.5 font-noto text-xs text-muted hover:text-clay2"
            : "btn-ghost"
        }
        aria-label={label}
      >
        <Flag className="h-3.5 w-3.5" /> {!compact && label}
      </button>
      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
        {...(targetUserId ? { targetUserId } : {})}
      />
    </>
  );
}
