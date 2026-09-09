"use client";

import { useEffect, useState } from "react";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isBlocked } from "@/lib/blocking";
import BlockUserModal from "./BlockUserModal";

export interface BlockButtonProps {
  targetUid: string;
  /** Handle or display name shown in the confirmation copy and button label. */
  targetLabel: string;
  /** Compact icon-only style for tight toolbars, matching ReportButton's `compact` prop. */
  compact?: boolean;
  /** Notified once the block succeeds, in addition to this button's own "Blocked" state — lets
   * a parent (e.g. MessagesClient) update state that lives outside this component. */
  onBlocked?: () => void;
}

/** Small reusable block trigger for profile pages — owns its own modal state and reflects
 * whether the viewer has already blocked this person, mirroring ReportButton's shape. */
export default function BlockButton({ targetUid, targetLabel, compact, onBlocked }: BlockButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user || user.uid === targetUid) return;
    isBlocked(user.uid, targetUid).then((b) => {
      setBlocked(b);
      setChecked(true);
    });
  }, [user, targetUid]);

  if (!user || user.uid === targetUid) return null;

  if (blocked) {
    return (
      <span
        className={
          compact
            ? "inline-flex items-center gap-1.5 font-noto text-xs text-muted"
            : "btn-ghost cursor-default opacity-70"
        }
      >
        <ShieldOff className="h-3.5 w-3.5" /> {!compact && "Blocked"}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!checked}
        className={
          compact
            ? "inline-flex items-center gap-1.5 font-noto text-xs text-muted hover:text-clay2"
            : "btn-ghost"
        }
        aria-label={`Block @${targetLabel}`}
      >
        <ShieldOff className="h-3.5 w-3.5" /> {!compact && "Block"}
      </button>
      <BlockUserModal
        open={open}
        onClose={() => setOpen(false)}
        currentUid={user.uid}
        targetUid={targetUid}
        targetLabel={targetLabel}
        onBlocked={() => {
          setBlocked(true);
          onBlocked?.();
        }}
      />
    </>
  );
}
