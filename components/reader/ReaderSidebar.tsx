"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { BookOpen, Ellipsis, MessagesSquare, Pencil, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { deleteChatMessage, editChatMessage, sendChatMessage, subscribeToChat } from "@/lib/firestore";
import { proxyImg, type ContentSource, type MangaDetailResponse } from "@/lib/manga-api";
import { formatTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import type { ChatMessage } from "@/types";

export type ReaderSidebarTab = "details" | "chapters" | "chat";

export interface ReaderSidebarChapter {
  id: string;
  chapter: string;
  createdAt?: string;
}

export interface ReaderSidebarProps {
  detail: MangaDetailResponse["data"] | null;
  detailLoading: boolean;
  chapters: ReaderSidebarChapter[];
  chapterIndex: number;
  onSelectChapter: (idx: number) => void;
  mangaId: string | null;
  mangaTitle: string;
  tab: ReaderSidebarTab;
  onTabChange: (tab: ReaderSidebarTab) => void;
}

const TABS: { value: ReaderSidebarTab; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "chapters", label: "Chapters" },
  { value: "chat", label: "Chat" },
];

/** Right sidebar: Details / Chapters / Chat tabs. Hidden on mobile. */
export default function ReaderSidebar({
  detail,
  detailLoading,
  chapters,
  chapterIndex,
  onSelectChapter,
  mangaId,
  mangaTitle,
  tab,
  onTabChange,
}: ReaderSidebarProps) {
  return (
    <aside className="hidden h-full w-[272px] shrink-0 flex-col border-l border-bg4 bg-bg2 md:flex">
      <div className="grid grid-cols-3 border-b border-bg4">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onTabChange(t.value)}
            className={`py-2.5 font-syne text-xs font-semibold transition-colors ${
              tab === t.value ? "border-b-2 border-clay text-clay2" : "text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "details" && <DetailsTab detail={detail} loading={detailLoading} />}
        {tab === "chapters" && (
          <ChaptersTab
            chapters={chapters}
            chapterIndex={chapterIndex}
            onSelectChapter={onSelectChapter}
          />
        )}
        {tab === "chat" && <ChatTab mangaId={mangaId} mangaTitle={mangaTitle} />}
      </div>
    </aside>
  );
}

const SOURCE_LINKS: Record<ContentSource | "fallback", { label: string; href: string }> = {
  mangadex: { label: "MangaDex", href: "https://mangadex.org" },
  comick: { label: "Comick", href: "https://comick.io" },
  mangahook: { label: "MangaHook API", href: "https://mangahook-api.vercel.app" },
  fallback: { label: "ÍléOtaku sample catalog", href: "https://mangahook-api.vercel.app" },
  // Not actually rendered from this table — DetailsTab special-cases source === "creator" with
  // its own "African Original 🌍" badge and a link to the creator's own profile instead. Kept
  // here only so this Record stays exhaustive over every ContentSource.
  creator: { label: "ÍléOtaku Creator", href: "/explore" },
};

/* ---------------------------- Details tab ---------------------------- */

function DetailsTab({
  detail,
  loading,
}: {
  detail: MangaDetailResponse["data"] | null;
  loading: boolean;
}) {
  if (loading || !detail) {
    return (
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        <Skeleton className="aspect-[3/4] w-full rounded-xl" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const genres = detail.genres ?? [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="aspect-[3/4] w-full overflow-hidden rounded-xl bg-bg3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            loading="lazy"
          src={proxyImg(detail.image)}
          alt={detail.title}
          className="h-full w-full object-cover"
        />
      </div>

      <div>
        <h2 className="font-syne text-base font-bold text-text">{detail.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.source === "creator" && (
            <span className="badge-plat inline-flex items-center gap-1 whitespace-nowrap">
              African Original 🌍
            </span>
          )}
          {detail.status && (
            <span className="rounded-full bg-green/15 px-2 py-0.5 font-noto text-[11px] font-semibold text-green2">
              {detail.status}
            </span>
          )}
          {detail.author && (
            <span className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[11px] text-muted">
              {detail.author}
            </span>
          )}
        </div>

        {genres.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <span
                key={g}
                className="rounded-full bg-clay/15 px-2 py-0.5 font-noto text-[11px] text-clay2"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {detail.description && (
        <p className="line-clamp-5 font-noto text-xs leading-relaxed text-muted">
          {detail.description}
        </p>
      )}

      {detail.source === "creator" && detail.authorHandle ? (
        <Link
          href={`/creator/${detail.authorHandle}`}
          className="mt-auto font-noto text-[11px] text-muted underline decoration-dotted hover:text-gold"
        >
          View creator&apos;s profile →
        </Link>
      ) : (
      <a
        href={SOURCE_LINKS[detail.source as ContentSource]?.href ?? SOURCE_LINKS.fallback.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto font-noto text-[11px] text-muted underline decoration-dotted hover:text-gold"
      >
        Source: {SOURCE_LINKS[detail.source as ContentSource]?.label ?? SOURCE_LINKS.fallback.label}
      </a>
      )}
    </div>
  );
}

/* ---------------------------- Chapters tab ---------------------------- */

function ChaptersTab({
  chapters,
  chapterIndex,
  onSelectChapter,
}: {
  chapters: ReaderSidebarChapter[];
  chapterIndex: number;
  onSelectChapter: (idx: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chapterIndex]);

  if (chapters.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <BookOpen className="h-6 w-6 text-muted" />
        <p className="font-noto text-xs text-muted">No chapters available yet.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      {chapters.map((c, i) => {
        const active = i === chapterIndex;
        return (
          <button
            key={c.id}
            ref={active ? activeRef : undefined}
            type="button"
            onClick={() => onSelectChapter(i)}
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
              active ? "bg-clay/20 text-clay2" : "text-text hover:bg-bg3"
            }`}
          >
            <span className="truncate font-noto text-xs font-semibold">{c.chapter}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {c.createdAt && (
                <span className="font-noto text-[10px] text-muted">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              )}
              <span className="rounded bg-bg4 px-1.5 py-0.5 font-noto text-[9px] font-semibold text-muted">
                EN
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------- Chat tab ---------------------------- */

export function ChatTab({ mangaId, mangaTitle }: { mangaId: string | null; mangaTitle: string }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Security rules require sign-in to read a room's messages, so don't even attempt the
    // subscription while signed out — avoids a guaranteed permission-denied round-trip.
    if (!mangaId || !user) {
      setMessages([]);
      return;
    }
    const unsubscribe = subscribeToChat(mangaId, setMessages, () => setMessages([]));
    return unsubscribe;
  }, [mangaId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    if (!user || !mangaId || !draft.trim()) return;
    setSending(true);
    try {
      await sendChatMessage(mangaId, {
        senderId: user.uid,
        senderName: profile?.displayName ?? user.displayName ?? "Reader",
        senderPhotoURL: user.photoURL ?? "",
        senderIsPlatinum: profile?.isPlatinum === true,
        text: draft.trim(),
      });
      setDraft("");
    } catch {
      toast.error("Couldn't send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-bg4 px-4 py-2">
        <p className="flex items-center gap-1.5 truncate font-syne text-xs font-semibold text-text">
          <MessagesSquare className="h-3.5 w-3.5 text-gold" /> {mangaTitle || "Chat"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="mt-8 text-center font-noto text-xs text-muted">
            No messages yet — say hello!
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div key={m.id} className="flex gap-2">
                <Avatar uid={m.senderId} photoURL={m.senderPhotoURL} displayName={m.senderName} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-syne text-xs font-semibold text-text">
                      {m.senderName}
                    </span>
                    {m.senderIsPlatinum && <span className="text-plat">✦</span>}
                    <span className="font-noto text-[10px] text-muted">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                  <p className="break-words font-noto text-xs text-text/90">{m.text}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-bg4 p-3">
        {user ? (
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={(e) => {
                // On mobile, the on-screen keyboard can open after layout has already
                // settled — nudge this input back into view above it once it does.
                const el = e.currentTarget;
                setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 300);
              }}
              placeholder="Say something..."
              rows={1}
              className="input-base min-h-[2.5rem] flex-1 resize-none text-base md:text-xs"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-clay text-ivory transition-colors hover:bg-clay2 disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="text-center font-noto text-xs text-muted">
            <Link href="/auth/login" className="text-gold hover:underline">
              Sign in
            </Link>{" "}
            to chat with other readers.
          </p>
        )}
      </div>
    </div>
  );
}
