"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessagesSquare, Users } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import MentionText from "@/components/ui/MentionText";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useAuth } from "@/hooks/useAuth";
import { getRecentChatMessages } from "@/lib/firestore";
import { formatTime } from "@/lib/utils";
import type { ChatMessage } from "@/types";

export interface LiveChatPreviewProps {
  mangaId: string;
}

/** How many of the fetched messages count toward the "chatting today" proxy figure. */
const RECENT_FETCH_COUNT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mobile-only "Live Reader Chat" teaser on the manga detail page: last 5 messages from the
 * manga's real-time chat room, plus a rough "how active is this room" count and a button
 * into the reader's Chat tab. Unlike the reader's own chat, this is a one-time fetch (not a
 * live subscription) — it's a preview, not something someone stares at, so it isn't worth
 * keeping a socket open for every manga page view.
 */
export default function LiveChatPreview({ mangaId }: LiveChatPreviewProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) {
      setMessages(null);
      setError(false);
      return;
    }
    let cancelled = false;
    getRecentChatMessages(mangaId, RECENT_FETCH_COUNT)
      .then((msgs) => {
        if (!cancelled) setMessages(msgs);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mangaId, user]);

  const dayAgo = Date.now() - DAY_MS;
  const activeCount = messages
    ? messages.filter((m) => new Date(m.createdAt).getTime() >= dayAgo).length
    : 0;
  // messages arrive newest-first; show oldest-of-the-five-newest first so it reads top-to-bottom.
  const lastFive = messages ? [...messages].slice(0, 5).reverse() : [];

  return (
    <section className="mt-10 w-full min-w-0 md:hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-cinzel text-xl text-text">
          <MessagesSquare className="h-5 w-5 text-gold" /> Live Reader Chat
        </h2>
        {user && messages && (
          <span className="flex items-center gap-1.5 rounded-full bg-green/15 px-2.5 py-1 font-noto text-xs font-semibold text-green2">
            <Users className="h-3.5 w-3.5" /> {activeCount} chatting today
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
        {!user ? (
          <p className="py-6 text-center font-noto text-sm text-muted">
            <Link href="/auth/login" className="text-gold hover:underline">
              Sign in
            </Link>{" "}
            to view and join the live chat.
          </p>
        ) : error ? (
          <p className="py-6 text-center font-noto text-sm text-muted">
            Couldn&apos;t load the chat right now.
          </p>
        ) : !messages ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5 py-0.5">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : lastFive.length === 0 ? (
          <p className="py-6 text-center font-noto text-sm text-muted">
            No messages yet — be the first to say hello!
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {lastFive.map((m) => (
              <div key={m.id} className="flex gap-2">
                <Avatar uid={m.senderId} photoURL={m.senderPhotoURL} displayName={m.senderName} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-syne text-xs font-semibold text-text">
                      {m.senderName}
                    </span>
                    <VerificationBadge
                      user={{
                        isFounder: m.senderIsFounder,
                        isAdmin: m.senderIsAdmin,
                        isVerified: m.senderIsVerified,
                        verifiedType: m.senderVerifiedType,
                      }}
                      size={11}
                    />
                    {m.senderIsPlatinum && <span className="text-plat">✦</span>}
                    <span className="font-noto text-[10px] text-muted">{formatTime(m.createdAt)}</span>
                  </div>
                  <p className="break-words font-noto text-xs text-text/90">
                    <MentionText text={m.text} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Link
          href={`/reader?id=${encodeURIComponent(mangaId)}&chat=1`}
          className="btn-primary mt-4 w-full justify-center text-sm"
        >
          Join the conversation →
        </Link>
      </div>
    </section>
  );
}
