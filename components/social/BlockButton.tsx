"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isBlocked, unblockUser } from "@/lib/blocking";
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
  /** Notified once an unblock succeeds — lets a parent immediately re-show content it was
   * hiding (e.g. BlockedContentGate, MessagesClient's "you've blocked this user" banner). */
  onUnblocked?: () => void;
}

/** Reusable block/unblock trigger for profile pages, DM headers, and anywhere else a 3-dot-style
 * "Block @handle" action lives — reflects whether the viewer has already blocked this person and
 * flips to "Unblock @handle" once they have, rather than a dead-end "Blocked" label. */
export default function BlockButton({ targetUid, targetLabel, compact, onBlocked, onUnblocked }: BlockButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  useEffect(() => {
    if (!user || user.uid === targetUid) return;
    isBlocked(user.uid, targetUid).then((b) => {
      setBlocked(b);
      setChecked(true);
    });
  }, [user, targetUid]);

  if (!user || user.uid === targetUid) return null;

  async function handleUnblock() {
    if (!user) return;
    setUnblocking(true);
    try {
      await unblockUser(user.uid, targetUid);
      setBlocked(false);
      toast.success(`Unblocked @${targetLabel}.`);
      onUnblocked?.();
    } catch {
      toast.error("Couldn't unblock this user. Please try again.");
    } finally {
      setUnblocking(false);
    }
  }

  if (blocked) {
    return (
      <button
        type="button"
        onClick={handleUnblock}
        disabled={unblocking}
        className={
          compact
            ? "inline-flex items-center gap-1.5 font-noto text-xs text-muted hover:text-gold"
            : "btn-ghost"
        }
        aria-label={`Unblock @${targetLabel}`}
      >
        {unblocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
        {!compact && (unblocking ? "Unblocking..." : `Unblock @${targetLabel}`)}
      </button>
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
