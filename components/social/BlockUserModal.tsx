"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, ShieldOff } from "lucide-react";
import { Modal } from "@/components/ui";
import { blockUser } from "@/lib/blocking";

export interface BlockUserModalProps {
  open: boolean;
  onClose: () => void;
  currentUid: string;
  targetUid: string;
  /** Handle or display name shown in the confirmation copy — whichever the caller has on hand. */
  targetLabel: string;
  onBlocked?: () => void;
}

/** Reusable block-confirmation modal — opened from the three-dot menu on a profile, comment, or
 * DM. Shared across every one of those surfaces so the confirmation copy and behavior stay
 * identical no matter where a block is triggered from. */
export default function BlockUserModal({
  open,
  onClose,
  currentUid,
  targetUid,
  targetLabel,
  onBlocked,
}: BlockUserModalProps) {
  const [blocking, setBlocking] = useState(false);

  async function handleConfirm() {
    setBlocking(true);
    try {
      await blockUser(currentUid, targetUid);
      toast.success(`Blocked @${targetLabel}.`);
      onBlocked?.();
      onClose();
    } catch {
      toast.error("Couldn't block this user. Please try again.");
    } finally {
      setBlocking(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Block @${targetLabel}?`}>
      <div className="flex flex-col gap-4">
        <p className="font-noto text-sm text-text">
          They won&apos;t be able to see your profile or contact you. You won&apos;t see their
          content.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={blocking} className="btn-ghost text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={blocking}
            className="inline-flex items-center gap-2 rounded-full bg-clay px-5 py-2.5 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-clay2 disabled:opacity-50"
          >
            {blocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
            Block
          </button>
        </div>
      </div>
    </Modal>
  );
}
