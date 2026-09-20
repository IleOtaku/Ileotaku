"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, X } from "lucide-react";
import { getVideoThumbnail } from "@/lib/cloudinary";
import { getConversationMedia } from "@/lib/dms";
import { DMVideoMessage } from "@/components/messages/DMVideoMessage";
import ImageViewer from "@/components/messages/ImageViewer";
import type { DMMessage } from "@/types";

export interface ConversationMediaClientProps {
  conversationId: string;
}

/** WhatsApp-style Group Info redesign: "See all media" destination — every shared image/video in
 * this conversation, not just the last 12 GroupInfoPanel's own strip shows. */
export default function ConversationMediaClient({ conversationId }: ConversationMediaClientProps) {
  const [media, setMedia] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageViewer, setImageViewer] = useState<number | null>(null);
  const [videoViewer, setVideoViewer] = useState<DMMessage | null>(null);
  const imageMessages = media.filter((m) => m.mediaType !== "video");

  useEffect(() => {
    let cancelled = false;
    getConversationMedia(conversationId, 500).then((result) => {
      if (!cancelled) {
        setMedia(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/messages" className="mb-4 flex items-center gap-1.5 font-noto text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to Messages
      </Link>
      <h1 className="mb-6 font-cinzel text-2xl text-text">Shared Media</h1>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : media.length === 0 ? (
        <p className="py-16 text-center font-noto text-sm text-muted">No shared media in this conversation yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((m) =>
            m.mediaType === "video" ? (
              // A poster tile with a play button — tapping opens our own player, never the browser's controls.
              <button key={m.id} type="button" onClick={() => setVideoViewer(m)} aria-label="Play video" className="relative aspect-square w-full overflow-hidden rounded-lg bg-bg3">
                {m.mediaUrl && getVideoThumbnail(m.mediaUrl) !== m.mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" src={getVideoThumbnail(m.mediaUrl)} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
                    <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                  </span>
                </span>
              </button>
            ) : (
              <button key={m.id} type="button" onClick={() => setImageViewer(imageMessages.findIndex((x) => x.id === m.id))} aria-label="Open photo" className="block aspect-square w-full overflow-hidden rounded-lg bg-bg3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy" src={m.mediaUrl} alt="" className="h-full w-full object-cover" />
              </button>
            )
          )}
        </div>
      )}
      {imageViewer !== null && (
        <ImageViewer urls={imageMessages.map((m) => m.mediaUrl ?? "")} startIndex={Math.max(0, imageViewer)} onClose={() => setImageViewer(null)} />
      )}
      {videoViewer && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4" onClick={() => setVideoViewer(null)}>
          <button type="button" onClick={() => setVideoViewer(null)} aria-label="Close" className="absolute right-4 top-4 text-white">
            <X className="h-6 w-6" />
          </button>
          <div onClick={(e) => e.stopPropagation()}>
            <DMVideoMessage url={videoViewer.mediaUrl ?? ""} duration={videoViewer.mediaDuration} width={videoViewer.mediaWidth} height={videoViewer.mediaHeight} isOwn={false} />
          </div>
        </div>
      )}
    </div>
  );
}
