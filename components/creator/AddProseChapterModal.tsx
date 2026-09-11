"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Bold, Italic, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { addChapter, countWords, estimateReadMinutes, saveChapterDraft } from "@/lib/publishedSeries";

export interface AddProseChapterModalProps {
  open: boolean;
  onClose: () => void;
  workId: string;
  /** Next chapter number to suggest by default — the creator's current chapterCount + 1. */
  suggestedNumber: number;
  onAdded: () => void;
  onDraftSaved?: () => void;
}

/**
 * Creator dashboard's "Add Chapter" flow for a prose (Wattpad-style) work: a plain textarea with
 * a small bold/italic/paragraph-break toolbar (wraps the current selection in `**`/`*` markers —
 * app/story/[workId]/page.tsx's reader parses those same markers back into <strong>/<em> when it
 * renders the chapter) rather than a full rich-text editor, plus a live word count. Chapters are
 * saved as plain text via lib/publishedSeries.ts's addChapter()/saveChapterDraft(), which derive
 * wordCount/estimatedReadTime from that text — no image upload involved.
 */
export default function AddProseChapterModal({
  open,
  onClose,
  workId,
  suggestedNumber,
  onAdded,
  onDraftSaved,
}: AddProseChapterModalProps) {
  const [chapterNumber, setChapterNumber] = useState(suggestedNumber);
  const [title, setTitle] = useState("");
  const [coinPrice, setCoinPrice] = useState(0);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wordCount = countWords(content);
  const readMinutes = estimateReadMinutes(wordCount);

  function resetForm() {
    setChapterNumber(suggestedNumber);
    setTitle("");
    setCoinPrice(0);
    setContent("");
  }

  function handleClose() {
    if (submitting || savingDraft) return;
    resetForm();
    onClose();
  }

  /** Wraps the current textarea selection in `marker` on both sides (e.g. "**" for bold), or
   * inserts a placeholder word wrapped in it when nothing is selected — the same affordance a
   * lightweight Markdown toolbar always offers. */
  function wrapSelection(marker: string, placeholder: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const selected = value.slice(selectionStart, selectionEnd) || placeholder;
    const next = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const start = selectionStart + marker.length;
      el.setSelectionRange(start, start + selected.length);
    });
  }

  function insertParagraphBreak() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, value } = el;
    const next = value.slice(0, selectionStart) + "\n\n" + value.slice(selectionStart);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + 2, selectionStart + 2);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("Write the chapter's text before publishing.");
      return;
    }
    if (chapterNumber < 1) {
      toast.error("Chapter number must be at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      await addChapter(workId, {
        chapterNumber,
        title: title.trim(),
        content,
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
    }
  }

  async function handleSaveDraft() {
    if (!content.trim()) {
      toast.error("Write the chapter's text before saving a draft.");
      return;
    }
    setSavingDraft(true);
    try {
      await saveChapterDraft(workId, {
        chapterNumber,
        title: title.trim(),
        content,
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
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Chapter">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Chapter Number</label>
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
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Coin Price</label>
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
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block font-syne text-xs font-semibold text-muted">Chapter Text</label>
            <span className="font-noto text-[11px] text-muted">
              {wordCount.toLocaleString()} words · ~{readMinutes} min read
            </span>
          </div>
          <div className="mb-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => wrapSelection("**", "bold text")}
              className="btn-ghost px-2.5 py-1.5 text-xs"
              title="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection("*", "italic text")}
              className="btn-ghost px-2.5 py-1.5 text-xs"
              title="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={insertParagraphBreak}
              className="btn-ghost px-2.5 py-1.5 text-xs"
              title="New paragraph"
            >
              ¶
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            placeholder="Once upon a time..."
            className="input-base min-h-64 w-full resize-y font-serif text-sm leading-relaxed"
          />
          <p className="mt-1 font-noto text-[11px] text-muted">
            Wrap text in **double asterisks** for bold, *single asterisks* for italic. Leave a
            blank line between paragraphs.
          </p>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={submitting || savingDraft}
            className="btn-ghost flex-1"
          >
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}
          </button>
          <button type="submit" disabled={submitting || savingDraft} className="btn-primary flex-1">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish Chapter"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
