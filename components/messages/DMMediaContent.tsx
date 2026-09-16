"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Download, File as FileIcon, Play, X } from "lucide-react";
import type { DMMessage } from "@/types";
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
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
    case "image":
      return (
        <>
          <button type="button" onClick={() => setLightboxOpen(true)} className="mb-1 block overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={m.mediaUrl} alt="" className="max-h-72 w-full object-cover" />
          </button>
          <AnimatePresence>
            {lightboxOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setLightboxOpen(false)}
                className="fixed inset-0 z-[210] flex items-center justify-center bg-black/95 p-4"
              >
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Close"
                  className="absolute right-4 top-4 text-white"
                >
                  <X className="h-6 w-6" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.mediaUrl} alt="" className="max-h-full max-w-full object-contain" style={{ touchAction: "pinch-zoom" }} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      );

    case "gif":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" src={m.mediaUrl} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
      );

    case "sticker":
      return <p className="text-6xl leading-none">{m.mediaUrl}</p>;

    case "video":
      return (
        <div className="relative mb-1 overflow-hidden rounded-xl bg-black">
          <video src={m.mediaUrl} controls className="max-h-72 w-full" />
          {m.mediaDuration && (
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 font-noto text-[10px] text-white">
              <Play className="h-2.5 w-2.5 fill-current" />
              {Math.floor(m.mediaDuration / 60)}:{String(Math.floor(m.mediaDuration % 60)).padStart(2, "0")}
            </span>
          )}
        </div>
      );

    case "voice":
      return <VoiceMessageBubble url={m.mediaUrl ?? ""} duration={m.mediaDuration ?? 0} isOwn={isOwn} />;

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
