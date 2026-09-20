"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import MentionText from "@/components/ui/MentionText";
import { cn } from "@/lib/utils";
import ImageViewer from "./ImageViewer";

export interface DMImageMessageProps {
  /** The (first) image. */
  url: string;
  /** All images when the message carries several — Telegram-style grid. Falls back to [url]. */
  urls?: string[];
  caption?: string;
  isOwn: boolean;
  /** Natural size of a single image, so the card is sized before it loads (no layout jump). */
  width?: number;
  height?: number;
}

const CARD_WIDTH = 280;

/** A photo (or a group of photos) in a chat bubble, Telegram style: one rounded card, the caption laid over
 * the bottom edge, a loading skeleton until each image arrives, and tap-to-fullscreen with pinch-zoom,
 * left/right browsing and a Download button.
 *
 * Layouts: 1 photo = full-width card · 2 = side by side · 3 = one wide on top, two below · 4 = 2x2 ·
 * 5+ = 2x2 with "+N" over the last cell. Every photo in a group shares the one rounded container.
 * The card has an explicit pixel width on purpose: a box sized only by aspect-ratio collapses to 0 wide
 * inside a shrink-to-fit bubble. */
export function DMImageMessage({ url, urls, caption, isOwn, width, height }: DMImageMessageProps) {
  const all = urls && urls.length > 0 ? urls : [url];
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const single = all.length === 1;
  const ratio = single && width && height ? Math.min(2, Math.max(0.6, width / height)) : undefined;
  const shown = all.slice(0, 4);
  const extra = all.length > 4 ? all.length - 3 : 0;

  const cellClass = (i: number) =>
    cn("relative overflow-hidden bg-white/5", all.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square");

  const cardRadius = cn("rounded-2xl", isOwn ? "rounded-tr-sm" : "rounded-tl-sm");

  function tile(src: string, i: number, extraStyle?: React.CSSProperties, imgClass = "h-full w-full object-cover") {
    return (
      <button
        key={src + i}
        type="button"
        onClick={() => setViewerIndex(i)}
        aria-label={single ? "Open photo" : `Open photo ${i + 1} of ${all.length}`}
        className={cn("group relative block", single ? "w-full" : cellClass(i))}
        style={extraStyle}
      >
        {!loaded[i] && !failed[i] && <span className="absolute inset-0 animate-pulse bg-white/5" data-testid="img-skeleton" />}
        {failed[i] ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/5 text-white/50">
            <ImageOff className="h-6 w-6" />
            <span className="font-noto text-[10px]">Unavailable</span>
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded((l) => ({ ...l, [i]: true }))}
            onError={() => setFailed((f) => ({ ...f, [i]: true }))}
            className={cn(imgClass, "transition-opacity", loaded[i] ? "opacity-100" : "opacity-0")}
          />
        )}
        <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
        {extra > 0 && i === shown.length - 1 && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-syne text-2xl font-bold text-white">+{extra}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <div className={cn("relative mb-1 overflow-hidden", cardRadius)} style={{ width: CARD_WIDTH, maxWidth: "100%" }} data-testid="dm-image-card">
        {single ? (
          // Skeleton reserves the space: the known aspect ratio, or 280x200 when the size isn't known.
          <div style={ratio ? { aspectRatio: ratio, maxHeight: 400 } : { minHeight: loaded[0] || failed[0] ? undefined : 200 }}>
            {tile(all[0], 0, ratio ? { height: "100%" } : undefined, ratio ? "h-full w-full object-cover" : "max-h-[400px] w-full object-cover")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-0.5" data-testid="image-grid">
            {shown.map((src, i) => tile(src, i))}
          </div>
        )}

        {caption && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
            <p className="line-clamp-4 whitespace-pre-wrap font-noto text-sm text-white" data-testid="dm-media-caption">
              <MentionText text={caption} />
            </p>
          </div>
        )}
      </div>

      {viewerIndex !== null && <ImageViewer urls={all} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
    </>
  );
}

export default DMImageMessage;
