import type { ContentSource } from "@/lib/manga-api";

export interface SourceBadgeProps {
  source: ContentSource | undefined;
  className?: string;
}

const BADGE_CONFIG: Partial<Record<ContentSource, { label: string; className: string }>> = {
  mangadex: { label: "MD", className: "bg-blue-500/90 text-white" },
  comick: { label: "CK", className: "bg-green-500/90 text-white" },
  mangahook: { label: "🌍", className: "bg-gold text-bg" },
};

/** Small pill identifying which catalog a manga card's data came from — MangaDex (blue),
 * Comick (green), or our own African-creator/MangaHook catalog (gold globe). Nothing renders
 * for plain fallback content, matching the spec ("no badge for fallback content"). */
export default function SourceBadge({ source, className = "" }: SourceBadgeProps) {
  const config = source ? BADGE_CONFIG[source] : undefined;
  if (!config) return null;

  return (
    <span
      className={`absolute bottom-1 left-1 rounded px-1 py-0.5 font-syne text-[9px] font-bold leading-none shadow ${config.className} ${className}`}
    >
      {config.label}
    </span>
  );
}
