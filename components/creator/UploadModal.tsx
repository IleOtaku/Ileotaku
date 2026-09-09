"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { ImagePlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { uploadImage } from "@/lib/cloudinary";
import { submitWork } from "@/lib/firestore";
import { GENRES } from "@/lib/utils";
import type { CreatorWork } from "@/types";

export interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  creatorId: string;
  onUploaded: () => void;
}

/** Upload-new-work modal: title/description/genre-chip form, cover upload, validation and submit. */
export default function UploadModal({ open, onClose, creatorId, onUploaded }: UploadModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleGenre(genre: string) {
    setGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    );
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setGenres([]);
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setCoverFile(null);
    setCoverPreviewUrl(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required.");
      return;
    }
    if (genres.length === 0) {
      toast.error("Pick at least one genre.");
      return;
    }

    setSubmitting(true);
    try {
      let coverURL = "";
      if (coverFile) {
        const uploaded = await uploadImage(coverFile, `covers/${creatorId}`);
        coverURL = uploaded.secureUrl;
      }

      const work: Omit<CreatorWork, "id" | "createdAt" | "updatedAt"> = {
        creatorId,
        title: title.trim(),
        description: description.trim(),
        coverURL,
        genres,
        status: "pending",
        views: 0,
        earnings: 0,
      };
      await submitWork(work);
      toast.success("Work submitted for review!");
      resetForm();
      onUploaded();
      onClose();
    } catch {
      toast.error("Something went wrong submitting your work. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Upload New Work">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">Title</label>
          <input
            className="input-base"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The name of your series"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
            Description
          </label>
          <textarea
            className="input-base min-h-24 resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's it about?"
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
                    active
                      ? "border-clay bg-clay text-ivory"
                      : "border-muted2 bg-bg3 text-muted hover:text-text"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-syne text-xs font-semibold text-muted">
            Cover Image
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted2 bg-bg3 py-8 text-center transition-colors hover:border-gold">
            {coverPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
            loading="lazy"
                src={coverPreviewUrl}
                alt="Cover preview"
                className="h-32 rounded-lg object-cover"
              />
            ) : (
              <>
                <ImagePlus className="h-6 w-6 text-muted" />
                <span className="font-noto text-xs text-muted">Click to upload a cover image</span>
              </>
            )}
            <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
          </label>
        </div>

        <button type="submit" disabled={submitting} className="btn-primary mt-2 w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for Review"}
        </button>
      </form>
    </Modal>
  );
}
