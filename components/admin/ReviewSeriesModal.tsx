"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, ShieldOff, Undo2 } from "lucide-react";
import { Modal, Skeleton } from "@/components/ui";
import { restoreSeries, suspendSeries } from "@/lib/admin";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import { getSeriesChapters } from "@/lib/publishedSeries";
import type { CreatorWork, PublishedChapter, PublishedSeries } from "@/types";

export interface ReviewSeriesModalProps {
  open: boolean;
  onClose: () => void;
  series: PublishedSeries | null;
  creatorWork: CreatorWork | null;
  onSuspendedChanged: (workId: string, isHidden: boolean) => void;
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-bg4 bg-bg3 p-3 text-center">
      <p className="font-cinzel text-lg text-gold">{value}</p>
      <p className="font-noto text-[11px] text-muted">{label}</p>
    </div>
  );
}

/** Admin's full preview panel for one approved/published series — cover, synopsis, chapter list,
 * creator info, and aggregate stats (reads/bookmarks/rating/revenue), plus the Suspend/Restore
 * moderation action. Opened from the Approved tab's "Review Series" option. */
export default function ReviewSeriesModal({
  open,
  onClose,
  series,
  creatorWork,
  onSuspendedChanged,
}: ReviewSeriesModalProps) {
  const [chapters, setChapters] = useState<PublishedChapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !series) return;
    setLoadingChapters(true);
    getSeriesChapters(series.id, { includeDrafts: true })
      .then(setChapters)
      .finally(() => setLoadingChapters(false));
  }, [open, series]);

  async function handleToggleSuspend() {
    if (!series) return;
    setBusy(true);
    try {
      if (series.isHidden) {
        await restoreSeries(series.id);
        toast.success(`"${series.title}" restored — visible again on Explore/Browse.`);
        onSuspendedChanged(series.id, false);
      } else {
        await suspendSeries(series.id);
        toast.success(`"${series.title}" suspended — hidden from Explore/Browse.`);
        onSuspendedChanged(series.id, true);
      }
    } catch {
      toast.error("Couldn't update this series. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Review Series">
      {series && (
        <div className="flex flex-col gap-5">
          <div className="flex gap-4">
            <div className="h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-bg3">
              {series.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" src={getOptimizedImageUrl(series.coverImage, 200)} alt={series.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-cinzel text-2xl text-muted">
                  {series.title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-cinzel text-lg text-text">{series.title}</h3>
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {series.genres.map((g) => (
                    <span key={g} className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[10px] text-muted">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="font-noto text-sm text-muted">{series.description}</p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBlock label="Reads" value={(series.totalReads ?? 0).toLocaleString()} />
            <StatBlock label="Bookmarks" value={(series.totalBookmarks ?? 0).toLocaleString()} />
            <StatBlock label="Rating" value={(series.averageRating ?? 0).toFixed(1)} />
            <StatBlock label="Revenue" value={`$${(creatorWork?.earnings ?? 0).toFixed(2)}`} />
          </div>

          <div>
            <h4 className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
              Chapters ({chapters.length})
            </h4>
            {loadingChapters ? (
              <Skeleton className="h-20 w-full rounded-xl" />
            ) : chapters.length === 0 ? (
              <p className="font-noto text-xs text-muted">No chapters published yet.</p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {chapters.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-bg3 px-3 py-1.5">
                    <span className="font-noto text-xs text-text">
                      #{c.chapterNumber} {c.title || ""}
                    </span>
                    <span className="font-noto text-[10px] text-muted">
                      {c.status === "draft" ? "Draft" : `${(c.readCount ?? 0).toLocaleString()} reads`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-bg4 pt-4">
            <button
              type="button"
              onClick={handleToggleSuspend}
              disabled={busy}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-syne text-sm font-semibold transition-colors disabled:opacity-50 ${
                series.isHidden
                  ? "bg-green/15 text-green2 hover:bg-green/25"
                  : "bg-clay/15 text-clay2 hover:bg-clay/25"
              }`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : series.isHidden ? (
                <Undo2 className="h-4 w-4" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
              {series.isHidden ? "Restore Series" : "Suspend Series"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
