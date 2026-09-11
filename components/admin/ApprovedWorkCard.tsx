"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Eye, Globe2, Loader2, Star, Trash2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui";
import { adminDeleteSeries, getCreatorWorkById, toggleWorkFlags } from "@/lib/admin";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import { formatTime } from "@/lib/utils";
import type { CreatorWork, PublishedSeries } from "@/types";
import ReviewSeriesModal from "./ReviewSeriesModal";

export interface ApprovedWorkCardProps {
  series: PublishedSeries;
  onUpdated: (workId: string, patch: Partial<PublishedSeries>) => void;
  onDeleted: (workId: string) => void;
}

/**
 * One live/published series in the admin Approved tab — Sprint "Polish-2" Part 2 rewrite: this
 * used to take a `CreatorWork` sourced from `getWorksByStatus("approved")`, a query that always
 * came back empty (see lib/admin.ts's getApprovedSeriesForAdmin doc comment for why). Now sourced
 * from `publishedSeries` directly, with the paired `creatorWorks` doc fetched alongside for the
 * "Submitted" date and revenue figure that publishedSeries doesn't itself carry.
 */
export default function ApprovedWorkCard({ series, onUpdated, onDeleted }: ApprovedWorkCardProps) {
  const [creatorWork, setCreatorWork] = useState<CreatorWork | null>(null);
  const [saving, setSaving] = useState<"featured" | "african" | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getCreatorWorkById(series.id).then(setCreatorWork);
  }, [series.id]);

  async function toggle(flag: "isFeatured" | "isAfricanOriginal", key: "featured" | "african") {
    setSaving(key);
    try {
      const next = !(flag === "isFeatured" ? series.isFeatured : creatorWork?.isAfricanOriginal);
      await toggleWorkFlags(series.id, { [flag]: next });
      if (flag === "isFeatured") onUpdated(series.id, { isFeatured: next });
      setCreatorWork((prev) => (prev ? { ...prev, [flag]: next } : prev));
    } catch {
      toast.error("Couldn't update this flag.");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminDeleteSeries(series);
      toast.success(`"${series.title}" has been deleted.`);
      setDeleteOpen(false);
      onDeleted(series.id);
    } catch {
      toast.error("Couldn't delete this series. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-bg4 bg-bg2 p-4 sm:flex-row sm:items-center">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-bg3">
        {series.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" src={getOptimizedImageUrl(series.coverImage, 200)} alt={series.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-cinzel text-xl text-muted">
            {series.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-syne text-sm font-semibold text-text">{series.title}</h3>
          {series.isHidden && (
            <span className="rounded-full bg-clay/15 px-2 py-0.5 font-syne text-[10px] font-semibold text-clay2">
              Suspended
            </span>
          )}
        </div>
        <Link
          href={series.authorHandle ? `/creator/${series.authorHandle}` : `/profile/${series.authorId}`}
          className="font-noto text-xs text-muted hover:text-gold hover:underline"
        >
          by {series.authorName}
        </Link>
        {series.genres.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {series.genres.slice(0, 4).map((g) => (
              <span key={g} className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[10px] text-muted">
                {g}
              </span>
            ))}
          </div>
        )}
        <p className="mt-1.5 font-noto text-[11px] text-muted">
          {series.chapterCount} chapter{series.chapterCount === 1 ? "" : "s"} · {series.totalReads.toLocaleString()} reads
          {creatorWork && <> · Submitted {formatTime(creatorWork.createdAt)}</>}
          {series.publishedAt && <> · Approved {formatTime(series.publishedAt)}</>}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggle("isFeatured", "featured")}
          disabled={saving !== null}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors disabled:opacity-50 ${
            series.isFeatured ? "border-gold bg-gold/15 text-gold" : "border-muted2 text-muted hover:text-text"
          }`}
        >
          {saving === "featured" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
          Featured
        </button>
        <button
          type="button"
          onClick={() => toggle("isAfricanOriginal", "african")}
          disabled={saving !== null}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors disabled:opacity-50 ${
            creatorWork?.isAfricanOriginal ? "border-green2 bg-green/15 text-green2" : "border-muted2 text-muted hover:text-text"
          }`}
        >
          {saving === "african" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
          African Original
        </button>
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-muted2 px-3 py-1.5 font-noto text-xs font-semibold text-muted hover:text-text"
        >
          <Eye className="h-3.5 w-3.5" /> Review
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-clay/40 px-3 py-1.5 font-noto text-xs font-semibold text-clay2 hover:bg-clay/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>

      <ReviewSeriesModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        series={series}
        creatorWork={creatorWork}
        onSuspendedChanged={(workId, isHidden) => onUpdated(workId, { isHidden })}
      />

      <Modal open={deleteOpen} onClose={() => (deleting ? null : setDeleteOpen(false))} title="Delete Series">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-clay/40 bg-clay/10 p-4">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-clay2" />
            <p className="font-noto text-sm text-text">
              Permanently delete {series.title}? This removes all chapters and reader access.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteOpen(false)} disabled={deleting} className="btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-900 px-4 py-2 font-syne text-sm font-semibold text-red-100 hover:bg-red-800 disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Permanently"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
