"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui";
import { deleteWork } from "@/lib/publishedSeries";
import type { CreatorWork } from "@/types";

export interface DeleteWorkModalProps {
  open: boolean;
  onClose: () => void;
  work: CreatorWork | null;
  onDeleted: (workId: string) => void;
}

/** Permanent-deletion confirmation — the creator must type the series' exact title before the
 * button enables, same "type to confirm" friction a destructive, unrecoverable action deserves. */
export default function DeleteWorkModal({ open, onClose, work, onDeleted }: DeleteWorkModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  function handleClose() {
    if (deleting) return;
    setConfirmText("");
    onClose();
  }

  async function handleDelete() {
    if (!work || confirmText !== work.title) return;
    setDeleting(true);
    try {
      await deleteWork(work.id);
      toast.success(`"${work.title}" has been deleted.`);
      onDeleted(work.id);
      handleClose();
    } catch {
      toast.error("Couldn't delete this work. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Delete Work">
      {work && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-clay/40 bg-clay/10 p-4">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-clay2" />
            <p className="font-noto text-sm text-text">
              This permanently removes <span className="font-semibold">{work.title}</span> and all
              its chapters. Readers who purchased chapters will lose access.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              Type <span className="font-mono text-text">{work.title}</span> to confirm
            </label>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input-base w-full"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleClose} className="btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmText !== work.title || deleting}
              className="rounded-lg bg-red-900 px-4 py-2 font-syne text-sm font-semibold text-red-100 hover:bg-red-800 disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Permanently"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
