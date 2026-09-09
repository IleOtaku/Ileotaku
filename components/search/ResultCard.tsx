import Link from "next/link";
import { Star } from "lucide-react";
import { proxyImg } from "@/lib/manga-api";
import type { SearchResultItem } from "./types";

const STATUS_STYLES: Record<string, string> = {
  ongoing: "bg-green/15 text-green2",
  completed: "bg-plat/15 text-plat2",
  hiatus: "bg-gold/15 text-gold2",
};

export interface ResultCardProps {
  item: SearchResultItem;
  view: "grid" | "list";
}

/** One search result, rendered either as a cover-dominant grid card or a detail-rich list row. */
export default function ResultCard({ item, view }: ResultCardProps) {
  const statusClass = STATUS_STYLES[item.status.toLowerCase()] ?? "bg-bg3 text-muted";

  if (view === "list") {
    return (
      <Link
        href={`/manga/${encodeURIComponent(item.id)}?from=search`}
        className="flex gap-4 rounded-xl border border-bg4 bg-bg2 p-3 transition-colors hover:border-clay"
      >
        <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-bg3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            loading="lazy" src={proxyImg(item.image)} alt={item.title} className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-syne text-sm font-semibold text-text">{item.title}</h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 font-noto text-[10px] font-semibold ${statusClass}`}
            >
              {item.status}
            </span>
          </div>
          <p className="font-noto text-xs text-muted">by {item.author}</p>
          {item.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.genres.slice(0, 4).map((g) => (
                <span key={g} className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[10px] text-muted">
                  {g}
                </span>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center gap-4 font-noto text-xs text-muted">
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {item.rating.toFixed(1)}
            </span>
            <span>{item.chapters} ch</span>
            <span>{item.views} reads</span>
          </div>
        </div>
        <div className="flex items-center">
          <span className="btn-primary pointer-events-none">Read Now</span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/manga/${encodeURIComponent(item.id)}?from=search`}
      className="group flex flex-col overflow-hidden rounded-xl border border-bg4 bg-bg2"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-bg3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            loading="lazy"
          src={proxyImg(item.image)}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 font-noto text-[10px] font-semibold ${statusClass}`}
        >
          {item.status}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="truncate font-syne text-xs font-semibold text-text">{item.title}</p>
        <p className="truncate font-noto text-[11px] text-muted">{item.author}</p>
        <div className="mt-auto flex items-center justify-between font-noto text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-gold text-gold" /> {item.rating.toFixed(1)}
          </span>
          <span>{item.chapters} ch</span>
        </div>
      </div>
    </Link>
  );
}
