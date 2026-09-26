"use client";

import Link from "next/link";
import { Download, File as FileIcon, Forward } from "lucide-react";
import type { DMMessage } from "@/types";
import { DMImageMessage } from "./DMImageMessage";
import { DMVideoMessage } from "./DMVideoMessage";
import VoiceMessageBubble from "./VoiceMessageBubble";

export interface DMMediaContentProps {
  /** The sender's custom bubble color (hex), so a voice note's play button can be drawn from it. */
  accentColor?: string;
  message: DMMessage;
  isOwn: boolean;
  /** Beta feedback: "Forward icon on all media." Opens the forward picker for this message.
   * Omitted entirely for share cards (manga/post) — only real media (image/video/voice/file/
   * sticker) gets the quick-forward overlay; those still have Forward via the long-press menu. */
  onForward?: () => void;
}

/** Visible always on mobile, only on hover on desktop — same "sm:opacity-0 sm:group-hover:opacity-100"
 * trick used elsewhere: there's no hover state on a touch screen, so mobile just always shows it. */
const FORWARD_BTN_CLASS =
  "absolute z-10 rounded-full bg-black/50 p-1.5 text-white transition-opacity sm:opacity-0 sm:group-hover:opacity-100";

function ForwardOverlayButton({ onForward, className }: { onForward: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onForward();
      }}
      aria-label="Forward message"
      className={`${FORWARD_BTN_CLASS} ${className}`}
    >
      <Forward className="h-3.5 w-3.5" />
    </button>
  );
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
export default function DMMediaContent({ message: m, isOwn, accentColor, onForward }: DMMediaContentProps) {

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
      return (
        <div className="group relative inline-block">
          <DMImageMessage
            url={urls[0]}
            urls={urls}
            caption={m.text || undefined}
            isOwn={isOwn}
            width={m.mediaWidth}
            height={m.mediaHeight}
          />
          {onForward && <ForwardOverlayButton onForward={onForward} className="right-3 top-2" />}
        </div>
      );
    }

    case "gif":
      return (
        <div className="group relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" src={m.mediaUrl} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
          {onForward && <ForwardOverlayButton onForward={onForward} className="right-2 top-2" />}
        </div>
      );

    case "sticker":
      // PART 6 — sticker packs: mediaUrl is now a real image URL (a pack's sticker), not the
      // literal emoji-glyph string the original curated-glyph picker sent — rendered as an
      // image, same shape as the gif case above, rather than giant text.
      return (
        <div className="group relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" src={m.mediaUrl} alt="" className="mb-1 h-32 w-32 object-contain" />
          {onForward && <ForwardOverlayButton onForward={onForward} className="right-1 top-1" />}
        </div>
      );

    case "video":
      return (
        <div className="group relative inline-block">
          <DMVideoMessage
            url={m.mediaUrl ?? ""}
            duration={m.mediaDuration}
            width={m.mediaWidth}
            height={m.mediaHeight}
            caption={m.text || undefined}
            isOwn={isOwn}
          />
          {/* Left corner — the video's own duration badge already owns the top-right. */}
          {onForward && <ForwardOverlayButton onForward={onForward} className="left-3 top-2" />}
        </div>
      );

    case "voice":
      return (
        <div className="group relative flex items-center gap-1">
          <VoiceMessageBubble url={m.mediaUrl ?? ""} duration={m.mediaDuration ?? 0} isOwn={isOwn} waveform={m.mediaWaveform} accentColor={accentColor} />
          {onForward && (
            <button
              type="button"
              onClick={() => onForward()}
              aria-label="Forward message"
              className={`shrink-0 rounded-full p-1.5 ${isOwn ? "text-ivory/70 hover:text-ivory" : "text-muted hover:text-text"} transition-opacity sm:opacity-0 sm:group-hover:opacity-100`}
            >
              <Forward className="h-4 w-4" />
            </button>
          )}
        </div>
      );

    case "file":
      return (
        <a
          href={m.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group mb-1 flex items-center gap-2.5 rounded-xl bg-black/10 p-2.5 hover:bg-black/20"
        >
          <FileIcon className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-noto text-xs font-semibold">{m.mediaFileName ?? "File"}</p>
            <p className="font-noto text-[10px] opacity-70">{formatBytes(m.mediaSize)}</p>
          </div>
          {onForward && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onForward();
              }}
              aria-label="Forward message"
              className="shrink-0 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Forward className="h-4 w-4" />
            </button>
          )}
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
      );

    default:
      return null;
  }
}
