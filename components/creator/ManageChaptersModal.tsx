"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, MoreVertical, TriangleAlert } from "lucide-react";
import { Modal, Skeleton, Tabs } from "@/components/ui";
import { deleteChapter, setChapterStatus, subscribeToSeriesChapters } from "@/lib/publishedSeries";
import EditChapterModal from "@/components/creator/EditChapterModal";
import type { PublishedChapter } from "@/types";

export interface ManageChaptersModalProps {
  open: boolean;
  onClose: () => void;
  workId: string | null;
  /** Bumps the parent's own chapterCount display after a status change/delete. */
  onChanged: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ChapterRowProps {
  chapter: PublishedChapter;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  busy: boolean;
}

function ChapterRow({ chapter, onEdit, onToggleStatus, onDelete, busy }: ChapterRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDraft = chapter.status === "draft";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg3 p-3">
      <span className="w-8 shrink-0 text-center font-cinzel text-sm text-muted">#{chapter.chapterNumber}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-syne text-sm font-semibold text-text">
            {chapter.title || `Chapter ${chapter.chapterNumber}`}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-syne text-[10px] font-semibold ${
              isDraft ? "bg-muted2/30 text-muted" : "bg-green/15 text-green2"
            }`}
          >
            {isDraft ? "Draft" : "Published"}
          </span>
        </div>
        <p className="mt-0.5 font-noto text-xs text-muted">
          {chapter.coinPrice === 0 ? "Free" : `${chapter.coinPrice} coins`} · {(chapter.readCount ?? 0).toLocaleString()} reads
          {!isDraft && <> · Published {formatDate(chapter.publishedAt)}</>}
        </p>
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          aria-label="Chapter options"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg4 hover:text-text disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="glass absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl p-1.5 text-left">
              <button
                type="button"
                onClick={() => {
                  onEdit();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-text hover:bg-bg4"
              >
                Edit Chapter
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleStatus();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-text hover:bg-bg4"
              >
                {isDraft ? "Publish" : "Turn to Draft"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-clay2 hover:bg-bg4"
              >
                Delete Chapter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Creator's per-chapter management surface: number/title/status badge/coin price/read count/
 * publish date, each with a 3-dot menu (Edit / Turn to Draft-or-Publish / Delete). Subscribes to
 * ALL of the work's chapters (published and draft) in real time, so an edit made here — or the
 * public page's own live chapter count/list — never needs a manual refresh either side.
 */
export default function ManageChaptersModal({ open, onClose, workId, onChanged }: ManageChaptersModalProps) {
  const [chapters, setChapters] = useState<PublishedChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"published" | "drafts">("published");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingChapter, setEditingChapter] = useState<PublishedChapter | null>(null);
  const [deletingChapter, setDeletingChapter] = useState<PublishedChapter | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !workId) return;
    setLoading(true);
    const unsub = subscribeToSeriesChapters(
      workId,
      (c) => {
        setChapters(c);
        setLoading(false);
      },
      { includeDrafts: true }
    );
    return unsub;
  }, [open, workId]);

  const published = chapters.filter((c) => c.status !== "draft");
  const drafts = chapters.filter((c) => c.status === "draft");
  const shown = tab === "published" ? published : drafts;

  async function handleToggleStatus(chapter: PublishedChapter) {
    if (!workId) return;
    setBusyId(chapter.id);
    try {
      await setChapterStatus(workId, chapter.id, chapter.status === "draft" ? "published" : "draft");
      toast.success(chapter.status === "draft" ? "Chapter published!" : "Chapter moved to Drafts.");
      onChanged();
    } catch {
      toast.error("Couldn't update this chapter. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!workId || !deletingChapter) return;
    setDeleting(true);
    try {
      const label = deletingChapter.title || `Chapter ${deletingChapter.chapterNumber}`;
      await deleteChapter(workId, deletingChapter.id, label);
      toast.success(`${label} deleted.`);
      setDeletingChapter(null);
      onChanged();
    } catch {
      toast.error("Couldn't delete this chapter. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Manage Chapters">
        <div className="flex flex-col gap-4">
          <Tabs
            tabs={[
              { label: `Published (${published.length})`, value: "published" },
              { label: `Drafts (${drafts.length})`, value: "drafts" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as "published" | "drafts")}
          />

          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center font-noto text-sm text-muted">
              {tab === "published" ? "No published chapters yet." : "No draft chapters."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {shown.map((c) => (
                <ChapterRow
                  key={c.id}
                  chapter={c}
                  busy={busyId === c.id}
                  onEdit={() => setEditingChapter(c)}
                  onToggleStatus={() => handleToggleStatus(c)}
                  onDelete={() => setDeletingChapter(c)}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      <EditChapterModal
        open={editingChapter !== null}
        onClose={() => setEditingChapter(null)}
        workId={workId ?? ""}
        chapter={editingChapter}
        onSaved={onChanged}
      />

      <Modal
        open={deletingChapter !== null}
        onClose={() => (deleting ? null : setDeletingChapter(null))}
        title="Delete Chapter"
      >
        {deletingChapter && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-xl border border-clay/40 bg-clay/10 p-4">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-clay2" />
              <p className="font-noto text-sm text-text">
                This permanently deletes Chapter {deletingChapter.chapterNumber} and all its
                content. Readers who purchased it will lose access.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingChapter(null)} disabled={deleting} className="btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-900 px-4 py-2 font-syne text-sm font-semibold text-red-100 hover:bg-red-800 disabled:opacity-40"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Permanently"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
