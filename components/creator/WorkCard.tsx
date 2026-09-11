import { useState } from "react";
import Link from "next/link";
import { Award, BookPlus, FileEdit, ListChecks, MoreVertical, Repeat, Trash2 } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import { formatTime } from "@/lib/utils";
import type { CreatorWork } from "@/types";

const STATUS_STYLES: Record<CreatorWork["status"], string> = {
  pending: "bg-gold/15 text-gold2",
  approved: "bg-plat/15 text-plat2",
  published: "bg-green/15 text-green2",
  rejected: "bg-clay/15 text-clay2",
};

const STATUS_LABELS: Record<CreatorWork["status"], string> = {
  pending: "Pending Review",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
};

export interface WorkCardProps {
  work: CreatorWork;
  /** Only meaningful once `work.status === "published"` — opens the Add Chapter modal. */
  onAddChapter?: () => void;
  /** Part 12 management actions — every work (regardless of status) can be edited/deleted; view
   * drafts and transfer ownership only make sense once it's actually published. */
  onEditSeries?: () => void;
  onDeleteWork?: () => void;
  onViewDrafts?: () => void;
  onTransferOwnership?: () => void;
  /** Sprint "Polish-2" Part 1 — opens the per-chapter management panel (edit/turn-to-draft/
   * delete). Only meaningful once `work.status === "published"`, same as onAddChapter. */
  onManageChapters?: () => void;
}

/** Reusable series card: cover, status badge, genre tags, view/submission stats, and earnings.
 * A published work also gets an Add Chapter action and a copyright-certificate link (Sprint 9f),
 * both absent on a work still pending/rejected/approved since neither applies yet. */
export default function WorkCard({
  work,
  onAddChapter,
  onEditSeries,
  onDeleteWork,
  onViewDrafts,
  onTransferOwnership,
  onManageChapters,
}: WorkCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasManagementMenu = onEditSeries || onDeleteWork || onViewDrafts || onTransferOwnership;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-bg4 bg-bg2">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-bg3">
        {work.coverURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy"
            src={getOptimizedImageUrl(work.coverURL, 400)}
            alt={work.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-cinzel text-3xl text-muted">
            {work.title.charAt(0).toUpperCase()}
          </div>
        )}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 font-syne text-xs font-semibold ${STATUS_STYLES[work.status]}`}
        >
          {STATUS_LABELS[work.status]}
        </span>
        {work.format?.toLowerCase() === "prose" && (
          <span className="badge-plat absolute bottom-3 left-3 whitespace-nowrap">📖 Prose</span>
        )}
        {hasManagementMenu && (
          <div className="absolute right-3 top-3">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Work options"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-bg/80 text-text backdrop-blur hover:bg-bg"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="glass absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-xl p-1.5 text-left">
                  {onEditSeries && (
                    <button
                      type="button"
                      onClick={() => {
                        onEditSeries();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-text hover:bg-bg4"
                    >
                      <FileEdit className="h-3.5 w-3.5" /> Edit Series
                    </button>
                  )}
                  {work.status === "published" && onViewDrafts && (
                    <button
                      type="button"
                      onClick={() => {
                        onViewDrafts();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-text hover:bg-bg4"
                    >
                      <FileEdit className="h-3.5 w-3.5" /> View Drafts
                    </button>
                  )}
                  {work.status === "published" && onTransferOwnership && (
                    <button
                      type="button"
                      onClick={() => {
                        onTransferOwnership();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-text hover:bg-bg4"
                    >
                      <Repeat className="h-3.5 w-3.5" /> Transfer Ownership
                    </button>
                  )}
                  {onDeleteWork && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteWork();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-xs text-clay2 hover:bg-bg4"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete Work
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-syne text-base font-semibold text-text">{work.title}</h3>
        <p className="line-clamp-2 font-noto text-sm text-muted">{work.description}</p>

        {work.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {work.genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[11px] text-muted"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-bg4 pt-3 font-noto text-xs text-muted">
          <span>{work.views.toLocaleString()} views</span>
          <span>Submitted {formatTime(work.createdAt)}</span>
        </div>

        <div className="flex items-center justify-between font-syne text-sm font-semibold">
          <span className="text-muted">Earnings</span>
          <span className="text-gold2">${work.earnings.toFixed(2)}</span>
        </div>

        {work.status === "published" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-bg4 pt-3">
            {onAddChapter && (
              <button
                type="button"
                onClick={onAddChapter}
                className="flex items-center gap-1.5 rounded-full bg-clay/15 px-3 py-1.5 font-noto text-xs font-semibold text-clay2 hover:bg-clay/25"
              >
                <BookPlus className="h-3.5 w-3.5" /> Add Chapter
              </button>
            )}
            {onManageChapters && (
              <button
                type="button"
                onClick={onManageChapters}
                className="flex items-center gap-1.5 rounded-full bg-bg3 px-3 py-1.5 font-noto text-xs font-semibold text-muted hover:bg-bg4 hover:text-text"
              >
                <ListChecks className="h-3.5 w-3.5" /> Manage Chapters
              </button>
            )}
            {work.certId && (
              <Link
                href={`/creator/certificate/${work.certId}`}
                className="flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 font-noto text-xs font-semibold text-gold2 hover:bg-gold/25"
              >
                <Award className="h-3.5 w-3.5" /> Certificate
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
