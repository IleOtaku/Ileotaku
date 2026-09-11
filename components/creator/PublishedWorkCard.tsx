import Link from "next/link";
import { BookOpen, Star } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/cloudinary";
import type { PublishedSeries } from "@/types";

export interface PublishedWorkCardProps {
  work: PublishedSeries;
}

/** Public-facing card for a creator's PUBLISHED work — shown on /creator/[handle]'s Works tab
 * and Explore's African Originals rail. Unlike the creator-dashboard-only WorkCard, this never
 * shows status or earnings (a public visitor has no business seeing either), only what a reader
 * actually cares about: cover, genres, read count, chapter/word count, and rating. A prose work
 * routes to /story/[id] instead of /manga/[id] and swaps the badge accordingly. */
export default function PublishedWorkCard({ work }: PublishedWorkCardProps) {
  const isProse = work.format?.toLowerCase() === "prose";
  return (
    <Link
      href={isProse ? `/story/${work.id}` : `/manga/${encodeURIComponent(work.id)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-bg4 bg-bg2 transition-colors hover:border-clay"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-bg3">
        {work.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            loading="lazy"
            src={getOptimizedImageUrl(work.coverImage, 400)}
            alt={work.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-cinzel text-3xl text-muted">
            {work.title.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="badge-plat absolute left-3 top-3 whitespace-nowrap">
          {isProse ? "📖 Prose" : "African Original 🌍"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-syne text-base font-semibold text-text">{work.title}</h3>

        {work.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {work.genres.slice(0, 3).map((genre) => (
              <span key={genre} className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[11px] text-muted">
                {genre}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-bg4 pt-3 font-noto text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> {work.totalReads.toLocaleString()} reads · {work.chapterCount}{" "}
            {work.chapterCount === 1 ? "chapter" : "chapters"}
            {isProse && work.totalWordCount ? ` · ${work.totalWordCount.toLocaleString()} words` : ""}
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {work.averageRating.toFixed(1)}
          </span>
        </div>
      </div>
    </Link>
  );
}
