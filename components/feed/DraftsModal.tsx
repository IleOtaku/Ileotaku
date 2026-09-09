"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FileEdit, Image as ImageIcon, Trash2, Video } from "lucide-react";
import { EmptyState, Modal, Skeleton } from "@/components/ui";
import { deleteDraft, getDrafts } from "@/lib/creatorFeed";
import { formatTime } from "@/lib/utils";
import type { CreatorPost } from "@/types";

export interface DraftsModalProps {
  open: boolean;
  onClose: () => void;
  uid: string;
  /** Loads a draft back into the composer for editing/publishing. */
  onResume: (draft: CreatorPost) => void;
}

/** Lists a creator's saved drafts (from users/{uid}/drafts) with a resume-editing action and a
 * delete action — opened from the composer's "Drafts" button. */
export default function DraftsModal({ open, onClose, uid, onResume }: DraftsModalProps) {
  const [drafts, setDrafts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getDrafts(uid)
      .then(setDrafts)
      .finally(() => setLoading(false));
  }, [open, uid]);

  async function handleDelete(draftId: string) {
    setDeletingId(draftId);
    try {
      await deleteDraft(uid, draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch {
      toast.error("Couldn't delete this draft.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Drafts">
      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={<FileEdit className="h-6 w-6 text-muted" />}
          title="No saved drafts"
          description="Drafts you save from the composer will show up here."
        />
      ) : (
        // No inner max-h/overflow-y-auto here — the Modal's own content area is already the
        // scroll container; a second one nested inside it just fights the first over which
        // actually scrolls.
        <div className="flex flex-col gap-2">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="flex items-start gap-3 rounded-xl border border-bg4 bg-bg3 p-3"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg2 text-muted">
                {draft.mediaType === "video" ? (
                  <Video className="h-4 w-4" />
                ) : draft.mediaType === "image" || draft.mediaType === "images" ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileEdit className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-noto text-sm text-text">
                  {draft.content || <span className="text-muted">(no text)</span>}
                </p>
                {draft.draftSavedAt && (
                  <p className="mt-1 font-noto text-[11px] text-muted">
                    Saved {formatTime(draft.draftSavedAt)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => onResume(draft)}
                  className="rounded-full bg-clay/15 px-3 py-1 font-noto text-xs font-semibold text-clay2 hover:bg-clay/25"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(draft.id)}
                  disabled={deletingId === draft.id}
                  aria-label="Delete draft"
                  className="flex items-center gap-1 font-noto text-[11px] text-muted hover:text-clay2"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
