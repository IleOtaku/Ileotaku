"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Trash2 } from "lucide-react";
import { Modal, Skeleton } from "@/components/ui";
import { deleteChapterDraft, getChapterDrafts, publishChapterDraft } from "@/lib/publishedSeries";
import type { ChapterDraft } from "@/types";

export interface ChapterDraftsModalProps {
  open: boolean;
  onClose: () => void;
  workId: string | null;
  /** Bumps the parent's chapterCount display after a draft is published. */
  onPublished: () => void;
}

/** Lists a work's saved-but-unpublished chapter drafts, each with Publish/Delete. */
export default function ChapterDraftsModal({ open, onClose, workId, onPublished }: ChapterDraftsModalProps) {
  const [drafts, setDrafts] = useState<ChapterDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workId) return;
    let cancelled = false;
    setLoading(true);
    getChapterDrafts(workId)
      .then((res) => !cancelled && setDrafts(res))
      .catch(() => !cancelled && setDrafts([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, workId]);

  async function handlePublish(draft: ChapterDraft) {
    if (!workId) return;
    setBusyId(draft.id);
    try {
      await publishChapterDraft(workId, draft);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.success(`Chapter ${draft.chapterNumber} published!`);
      onPublished();
    } catch {
      toast.error("Couldn't publish this draft.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(draft: ChapterDraft) {
    if (!workId) return;
    setBusyId(draft.id);
    try {
      await deleteChapterDraft(workId, draft.id);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch {
      toast.error("Couldn't delete this draft.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Chapter Drafts">
      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <p className="py-6 text-center font-noto text-sm text-muted">No saved drafts for this work.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg3 p-3">
              {d.images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" src={d.images[0]} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-syne text-sm font-semibold text-text">
                  Chapter {d.chapterNumber}
                  {d.title ? ` — ${d.title}` : ""}
                </p>
                <p className="font-noto text-xs text-muted">
                  {d.images.length} page{d.images.length === 1 ? "" : "s"} · {d.coinPrice === 0 ? "Free" : `${d.coinPrice} coins`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(d)}
                disabled={busyId === d.id}
                aria-label="Delete draft"
                className="shrink-0 text-muted hover:text-clay2 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handlePublish(d)}
                disabled={busyId === d.id}
                className="btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {busyId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Publish"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
