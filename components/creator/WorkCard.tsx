import Link from "next/link";
import { Award, BookPlus } from "lucide-react";
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
}

/** Reusable series card: cover, status badge, genre tags, view/submission stats, and earnings.
 * A published work also gets an Add Chapter action and a copyright-certificate link (Sprint 9f),
 * both absent on a work still pending/rejected/approved since neither applies yet. */
export default function WorkCard({ work, onAddChapter }: WorkCardProps) {
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
