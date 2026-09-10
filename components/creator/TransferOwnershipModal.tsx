"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { requestOwnershipTransfer } from "@/lib/publishedSeries";
import type { CreatorWork } from "@/types";

export interface TransferOwnershipModalProps {
  open: boolean;
  onClose: () => void;
  work: CreatorWork | null;
  fromUid: string;
  fromDisplayName: string;
}

/** Starts a series handoff — nothing changes on the work itself until the recipient accepts the
 * request from their own notification. */
export default function TransferOwnershipModal({
  open,
  onClose,
  work,
  fromUid,
  fromDisplayName,
}: TransferOwnershipModalProps) {
  const [handle, setHandle] = useState("");
  const [sending, setSending] = useState(false);

  function handleClose() {
    if (sending) return;
    setHandle("");
    onClose();
  }

  async function handleSend() {
    if (!work || !handle.trim()) return;
    setSending(true);
    try {
      await requestOwnershipTransfer(work.id, work.title, fromUid, fromDisplayName, handle);
      toast.success(`Transfer request sent to @${handle.trim().replace(/^@/, "")}.`);
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send this request.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Transfer Ownership">
      {work && (
        <div className="flex flex-col gap-4">
          <p className="font-noto text-sm text-muted">
            Transfer <span className="font-semibold text-text">{work.title}</span> to another
            creator. They&apos;ll get a notification to accept or decline — nothing changes until
            they do.
          </p>
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Recipient&apos;s @handle</label>
            <input
              autoFocus
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle"
              className="input-base w-full"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleClose} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={handleSend} disabled={!handle.trim() || sending} className="btn-primary">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
