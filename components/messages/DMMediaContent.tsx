"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, File as FileIcon } from "lucide-react";
import type { DMMessage } from "@/types";
import DMVideoPlayer from "./DMVideoPlayer";
import ImageViewer from "./ImageViewer";
import VoiceMessageBubble from "./VoiceMessageBubble";

export interface DMMediaContentProps {
  message: DMMessage;
  isOwn: boolean;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** DM Feature Overhaul (Part A): renders whatever a message's mediaType/shared-item fields carry
 * — everything else about the bubble (bubble shape/color, timestamp, reactions, reply quote)
 * stays exactly as MessagesClient already renders it around this. Returns null for a plain text
 * message, so callers can render this unconditionally right before MentionText. */
export default function DMMediaContent({ message: m, isOwn }: DMMediaContentProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (m.sharedMangaId) {
    return (
      <Link
        href={`/manga/${encodeURIComponent(m.sharedMangaId)}`}
        className="mb-1.5 flex items-center gap-3 rounded-xl bg-black/10 p-2 hover:bg-black/20"
      >
        {m.sharedMangaCoverURL && (
          <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-bg3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={m.sharedMangaCoverURL} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-noto text-[10px] uppercase tracking-wide opacity-70">Shared Manga</p>
          <p className="truncate font-syne text-sm font-semibold">{m.sharedMangaTitle}</p>
        </div>
      </Link>
    );
  }

  if (m.sharedPostId) {
    return (
      <Link href={`/feed/${m.sharedPostId}`} className="mb-1.5 flex items-center gap-3 rounded-xl bg-black/10 p-2 hover:bg-black/20">
        {m.sharedPostMediaUrl && (
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={m.sharedPostMediaUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-noto text-[10px] uppercase tracking-wide opacity-70">Shared Post · {m.sharedPostAuthorName}</p>
          <p className="truncate font-noto text-xs">{m.sharedPostPreviewText || "(no caption)"}</p>
        </div>
      </Link>
    );
  }

  switch (m.mediaType) {
    case "image": {
      const urls = m.mediaUrls && m.mediaUrls.length > 0 ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [];
      if (urls.length === 0) return null;
      const open = (i: number) => setViewerIndex(i);

      // One photo: as wide as the bubble allows, its own aspect ratio, never taller than 300px.
      if (urls.length === 1) {
        const ratio = m.mediaWidth && m.mediaHeight ? m.mediaWidth / m.mediaHeight : undefined;
        return (
          <>
            <button
              type="button"
              onClick={() => open(0)}
              aria-label="Open photo"
              className={ratio ? "mb-1 block overflow-hidden rounded-xl" : "mb-1 block max-h-[300px] w-full overflow-hidden rounded-xl"}
              // Explicit width (see DMVideoPlayer): full bubble width up to 340px, never taller than 300px.
              style={ratio ? { aspectRatio: ratio, width: Math.round(Math.min(340, 300 * ratio)), maxWidth: "100%" } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" src={urls[0]} alt="" className={ratio ? "h-full w-full object-cover" : "max-h-[300px] w-full object-cover"} />
            </button>
            {viewerIndex !== null && <ImageViewer urls={urls} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
          </>
        );
      }

      // Several photos: a 2x2 grid (first four), each tappable; extras collapse into a "+N" tile.
      const shown = urls.slice(0, 4);
      const extra = urls.length - shown.length;
      return (
        <>
          <div className="mb-1 grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl" style={{ width: 300, maxWidth: "100%" }} data-testid="image-grid">
            {shown.map((u, i) => (
              <button
                key={u + i}
                type="button"
                onClick={() => open(i)}
                aria-label={`Open photo ${i + 1} of ${urls.length}`}
                className={`relative overflow-hidden bg-black/20 ${shown.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy" src={u} alt="" className="h-full w-full object-cover" />
                {extra > 0 && i === shown.length - 1 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-syne text-lg font-bold text-white">+{extra + 1}</span>
                )}
              </button>
            ))}
          </div>
          {viewerIndex !== null && <ImageViewer urls={urls} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
        </>
      );
    }

    case "gif":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" src={m.mediaUrl} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
      );

    case "sticker":
      // PART 6 — sticker packs: mediaUrl is now a real image URL (a pack's sticker), not the
      // literal emoji-glyph string the original curated-glyph picker sent — rendered as an
      // image, same shape as the gif case above, rather than giant text.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" src={m.mediaUrl} alt="" className="mb-1 h-32 w-32 object-contain" />
      );

    case "video":
      return <DMVideoPlayer url={m.mediaUrl ?? ""} duration={m.mediaDuration} width={m.mediaWidth} height={m.mediaHeight} />;

    case "voice":
      return <VoiceMessageBubble url={m.mediaUrl ?? ""} duration={m.mediaDuration ?? 0} isOwn={isOwn} waveform={m.mediaWaveform} />;

    case "file":
      return (
        <a
          href={m.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 flex items-center gap-2.5 rounded-xl bg-black/10 p-2.5 hover:bg-black/20"
        >
          <FileIcon className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-noto text-xs font-semibold">{m.mediaFileName ?? "File"}</p>
            <p className="font-noto text-[10px] opacity-70">{formatBytes(m.mediaSize)}</p>
          </div>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
      );

    default:
      return null;
  }
}
