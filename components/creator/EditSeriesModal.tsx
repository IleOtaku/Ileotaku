"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ImagePlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { uploadImage } from "@/lib/cloudinary";
import { updateSeriesDetails } from "@/lib/publishedSeries";
import { GENRES } from "@/lib/utils";
import type { CreatorWork } from "@/types";

export interface EditSeriesModalProps {
  open: boolean;
  onClose: () => void;
  work: CreatorWork | null;
  onSaved: (patch: Partial<CreatorWork>) => void;
}

const CONTENT_RATINGS = ["All Ages", "Teen", "Mature"];

/** Edits a work's series-level details (title, synopsis, genres, cover, update schedule, content
 * rating) — writes go through updateSeriesDetails() (lib/publishedSeries.ts), which keeps
 * creatorWorks and publishedSeries in sync so the change reflects on the public manga page and
 * in the reader immediately, not just the dashboard. */
export default function EditSeriesModal({ open, onClose, work, onSaved }: EditSeriesModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [updateSchedule, setUpdateSchedule] = useState("");
  const [contentRating, setContentRating] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seeds the form from `work` every time a different (or the same, freshly-fetched) work is
  // opened for editing — this modal is mounted once and reused across cards, not remounted per
  // work, so it can't rely on initial useState values alone.
  useEffect(() => {
    if (!work) return;
    setTitle(work.title);
    setDescription(work.description);
    setGenres(work.genres);
    setUpdateSchedule(work.updateSchedule ?? "");
    setContentRating(work.contentRating ?? "");
    setCoverFile(null);
    setCoverPreviewUrl(null);
  }, [work]);

  function toggleGenre(genre: string) {
    setGenres((current) => (current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]));
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
  }

  function handleClose() {
    if (saving) return;
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!work) return;
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required.");
      return;
    }
    setSaving(true);
    try {
      let coverURL: string | undefined;
      if (coverFile) {
        const uploaded = await uploadImage(coverFile, `covers/${work.creatorId}`);
        coverURL = uploaded.secureUrl;
      }

      const patch = {
        title: title.trim(),
        description: description.trim(),
        genres,
        updateSchedule: updateSchedule.trim() || undefined,
        contentRating: contentRating || undefined,
        ...(coverURL ? { coverURL } : {}),
      };
      await updateSeriesDetails(work.id, patch);
      toast.success("Series updated.");
      onSaved(patch);
      handleClose();
    } catch {
      toast.error("Couldn't save these changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Edit Series">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Title</label>
          <input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Synopsis</label>
          <textarea
            className="input-base min-h-24 resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Genres</label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => {
              const active = genres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={`rounded-full border px-3 py-1.5 font-noto text-xs transition-colors ${
                    active ? "border-clay bg-clay text-ivory" : "border-muted2 bg-bg3 text-muted hover:text-text"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Update Schedule</label>
            <input
              className="input-base"
              value={updateSchedule}
              onChange={(e) => setUpdateSchedule(e.target.value)}
              placeholder="e.g. Weekly on Fridays"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Content Rating</label>
            <select
              className="input-base"
              value={contentRating}
              onChange={(e) => setContentRating(e.target.value)}
            >
              <option value="">Unset</option>
              {CONTENT_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Cover Image</label>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted2 bg-bg3 py-8 text-center transition-colors hover:border-gold">
            {coverPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" src={coverPreviewUrl} alt="Cover preview" className="h-32 rounded-lg object-cover" />
            ) : work?.coverURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" src={work.coverURL} alt="Current cover" className="h-32 rounded-lg object-cover" />
            ) : (
              <>
                <ImagePlus className="h-6 w-6 text-muted" />
                <span className="font-noto text-xs text-muted">Click to change cover image</span>
              </>
            )}
            <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
          </label>
        </div>

        <button type="submit" disabled={saving} className="btn-primary mt-2 w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
        </button>
      </form>
    </Modal>
  );
}
