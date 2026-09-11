"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { GripVertical, ImagePlus, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui";
import { uploadImage } from "@/lib/cloudinary";
import { countWords, estimateReadMinutes, updateChapter } from "@/lib/publishedSeries";
import type { PublishedChapter } from "@/types";

export interface EditChapterModalProps {
  open: boolean;
  onClose: () => void;
  workId: string;
  chapter: PublishedChapter | null;
  onSaved: () => void;
}

interface StagedPage {
  /** Either an already-uploaded page (existing chapter image) or a freshly picked file waiting
   * to upload — `preview` is a secureUrl for the former, an object URL for the latter. */
  file?: File;
  preview: string;
}

/** Creator's per-chapter "Edit Chapter" — pre-filled with the chapter's current title, coin
 * price, and content (prose) or page images (manga/manhwa/manhua), saving back to
 * series/{workId}/chapters/{chapterId} via lib/publishedSeries.ts's updateChapter(). Both the
 * public manga page and the reader read this same doc live, so a save reflects immediately with
 * no refresh needed on either. */
export default function EditChapterModal({ open, onClose, workId, chapter, onSaved }: EditChapterModalProps) {
  const isProse = chapter?.content !== undefined;

  const [title, setTitle] = useState("");
  const [coinPrice, setCoinPrice] = useState(0);
  const [content, setContent] = useState("");
  const [pages, setPages] = useState<StagedPage[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!open || !chapter) return;
    setTitle(chapter.title ?? "");
    setCoinPrice(chapter.coinPrice ?? 0);
    setContent(chapter.content ?? "");
    setPages((chapter.images ?? []).map((url) => ({ preview: url })));
  }, [open, chapter]);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  function handleFilesAdded(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPages((current) => [
      ...current,
      ...files.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
    e.target.value = "";
  }

  function removePage(index: number) {
    setPages((current) => current.filter((_, i) => i !== index));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chapter) return;

    if (isProse && !content.trim()) {
      toast.error("Chapter content can't be empty.");
      return;
    }
    if (!isProse && pages.length === 0) {
      toast.error("A chapter needs at least one page image.");
      return;
    }

    setSaving(true);
    try {
      if (isProse) {
        const wordCount = countWords(content);
        await updateChapter(workId, chapter.id, {
          title: title.trim(),
          coinPrice: Math.max(0, coinPrice),
          content,
          wordCount,
          estimatedReadTime: estimateReadMinutes(wordCount),
        });
      } else {
        const toUpload = pages.filter((p) => p.file);
        setProgress(toUpload.length > 0 ? { done: 0, total: toUpload.length } : null);
        const images: string[] = [];
        for (const page of pages) {
          if (page.file) {
            const uploaded = await uploadImage(page.file, `chapters/${workId}/ch${chapter.chapterNumber}`);
            images.push(uploaded.secureUrl);
            setProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
          } else {
            images.push(page.preview);
          }
        }
        await updateChapter(workId, chapter.id, {
          title: title.trim(),
          coinPrice: Math.max(0, coinPrice),
          images,
        });
      }
      toast.success("Chapter updated.");
      onSaved();
      onClose();
    } catch {
      toast.error("Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Edit Chapter${chapter ? ` ${chapter.chapterNumber}` : ""}`}>
      {chapter && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Chapter Title</label>
            <input
              className="input-base w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Chapter ${chapter.chapterNumber}`}
            />
          </div>

          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Coin Price</label>
            <input
              type="number"
              min={0}
              className="input-base w-full"
              value={coinPrice}
              onChange={(e) => setCoinPrice(Number(e.target.value))}
              placeholder="0 = free"
            />
          </div>

          {isProse ? (
            <div>
              <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Content</label>
              <textarea
                className="input-base min-h-[240px] w-full resize-y"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
                Pages — drag to reorder
              </label>
              <div className="flex flex-col gap-2">
                {pages.map((page, i) => (
                  <div
                    key={page.preview}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                    className="flex cursor-grab items-center gap-3 rounded-lg border border-muted2 bg-bg3 p-2 active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted" />
                    <span className="w-6 shrink-0 text-center font-noto text-xs text-muted">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" src={page.preview} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate font-noto text-xs text-muted">
                      {page.file ? page.file.name : "Existing page"}
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
                  <input type="file" accept="image/*" multiple onChange={handleFilesAdded} className="hidden" />
                </label>
              </div>
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary mt-2">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress ? `Uploading ${progress.done}/${progress.total}...` : "Saving..."}
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </form>
      )}
    </Modal>
  );
}
