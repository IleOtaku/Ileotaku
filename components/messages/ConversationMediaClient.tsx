"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getConversationMedia } from "@/lib/dms";
import type { DMMessage } from "@/types";

export interface ConversationMediaClientProps {
  conversationId: string;
}

/** WhatsApp-style Group Info redesign: "See all media" destination — every shared image/video in
 * this conversation, not just the last 12 GroupInfoPanel's own strip shows. */
export default function ConversationMediaClient({ conversationId }: ConversationMediaClientProps) {
  const [media, setMedia] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);

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
              <video key={m.id} src={m.mediaUrl} controls className="aspect-square w-full rounded-lg bg-bg3 object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} loading="lazy" src={m.mediaUrl} alt="" className="aspect-square w-full rounded-lg bg-bg3 object-cover" />
            )
          )}
        </div>
      )}
    </div>
  );
}
