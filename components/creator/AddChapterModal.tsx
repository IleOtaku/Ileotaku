"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { GripVertical, ImagePlus, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui";
import { uploadImage } from "@/lib/cloudinary";
import { addChapter, saveChapterDraft } from "@/lib/publishedSeries";

export interface AddChapterModalProps {
  open: boolean;
  onClose: () => void;
  workId: string;
  /** Next chapter number to suggest by default — the creator's current chapterCount + 1. */
  suggestedNumber: number;
  onAdded: () => void;
  /** Called after "Save Draft" succeeds — lets the parent refresh its draft list/badge. Optional
   * since not every caller of this modal necessarily shows a drafts view. */
  onDraftSaved?: () => void;
}

interface StagedPage {
  file: File;
  previewUrl: string;
}

/**
 * Creator dashboard's "Add Chapter" flow for an already-published work: multi-image upload (each
 * page dragged into reading order), a chapter number/title, and a coin price (0 for a free
 * chapter — the convention for a series' first several chapters, per Sprint 9f's spec). Uploads
 * every page to Cloudinary, then writes the chapter doc via lib/publishedSeries.ts's addChapter().
 */
export default function AddChapterModal({
  open,
  onClose,
  workId,
  suggestedNumber,
  onAdded,
  onDraftSaved,
}: AddChapterModalProps) {
  const [chapterNumber, setChapterNumber] = useState(suggestedNumber);
  const [title, setTitle] = useState("");
  const [coinPrice, setCoinPrice] = useState(0);
  const [pages, setPages] = useState<StagedPage[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function resetForm() {
    pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setChapterNumber(suggestedNumber);
    setTitle("");
    setCoinPrice(0);
    setPages([]);
    setProgress(null);
  }

  function handleClose() {
    if (submitting) return;
    resetForm();
    onClose();
  }

  function handleFilesAdded(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPages((current) => [
      ...current,
      ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    e.target.value = "";
  }

  function removePage(index: number) {
    setPages((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    setPages((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function uploadPages(): Promise<string[]> {
    const images: string[] = [];
    for (const page of pages) {
      const uploaded = await uploadImage(page.file, `chapters/${workId}/ch${chapterNumber}`);
      images.push(uploaded.secureUrl);
      setProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
    }
    return images;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pages.length === 0) {
      toast.error("Add at least one page image.");
      return;
    }
    if (chapterNumber < 1) {
      toast.error("Chapter number must be at least 1.");
      return;
    }

    setSubmitting(true);
    setProgress({ done: 0, total: pages.length });
    try {
      const images = await uploadPages();
      await addChapter(workId, {
        chapterNumber,
        title: title.trim(),
        images,
        coinPrice: Math.max(0, coinPrice),
      });

      toast.success(`Chapter ${chapterNumber} published!`);
      resetForm();
      onAdded();
      onClose();
    } catch {
      toast.error("Something went wrong publishing this chapter. Please try again.");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  async function handleSaveDraft() {
    if (pages.length === 0) {
      toast.error("Add at least one page image.");
      return;
    }
    setSavingDraft(true);
    setProgress({ done: 0, total: pages.length });
    try {
      const images = await uploadPages();
      await saveChapterDraft(workId, {
        chapterNumber,
        title: title.trim(),
        images,
        coinPrice: Math.max(0, coinPrice),
      });
      toast.success("Draft saved.");
      resetForm();
      onDraftSaved?.();
      onClose();
    } catch {
      toast.error("Couldn't save this draft. Please try again.");
    } finally {
      setSavingDraft(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Chapter">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              Chapter Number
            </label>
            <input
              type="number"
              min={1}
              className="input-base"
              value={chapterNumber}
              onChange={(e) => setChapterNumber(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
              Coin Price
            </label>
            <input
              type="number"
              min={0}
              className="input-base"
              value={coinPrice}
              onChange={(e) => setCoinPrice(Number(e.target.value))}
              placeholder="0 = free"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
            Chapter Title (optional)
          </label>
          <input
            className="input-base"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Chapter ${chapterNumber}`}
          />
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
            Pages — drag to reorder
          </label>
          <div className="flex flex-col gap-2">
            {pages.map((page, i) => (
              <div
                key={page.previewUrl}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                className="flex cursor-grab items-center gap-3 rounded-lg border border-muted2 bg-bg3 p-2 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted" />
                <span className="w-6 shrink-0 text-center font-noto text-xs text-muted">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
            loading="lazy" src={page.previewUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate font-noto text-xs text-muted">
                  {page.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removePage(i)}
                  aria-label="Remove page"
                  className="shrink-0 text-muted hover:text-clay2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-muted2 bg-bg3 py-6 text-center transition-colors hover:border-gold">
              <ImagePlus className="h-5 w-5 text-muted" />
              <span className="font-noto text-xs text-muted">Add page images</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilesAdded}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={submitting || savingDraft}
            className="btn-ghost flex-1"
          >
            {savingDraft ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress ? `Uploading ${progress.done}/${progress.total}...` : "Saving..."}
              </>
            ) : (
              "Save Draft"
            )}
          </button>
          <button type="submit" disabled={submitting || savingDraft} className="btn-primary flex-1">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress ? `Uploading ${progress.done}/${progress.total}...` : "Publishing..."}
              </>
            ) : (
              "Publish Chapter"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
