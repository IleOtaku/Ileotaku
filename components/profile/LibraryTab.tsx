"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { BookOpen, Bookmark, Check, CheckSquare, Loader2, Trash2, X } from "lucide-react";
import DownloadsSection from "@/components/profile/DownloadsSection";
import { EmptyState, Modal, Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { useMangaSummaries } from "@/hooks/useMangaSummaries";
import { getSavedPosts, type SavedPostEntry } from "@/lib/creatorFeed";
import { clearLibrary, removeFromLibrary } from "@/lib/firestore";
import { getVideoThumbnail } from "@/lib/cloudinary";
import { proxyImg } from "@/lib/manga-api";

/** Currently Reading (real per-manga progress), a Bookmarked grid fetched from readingList, and
 * Saved Posts (feed posts bookmarked from the TikTok-style feed). */
export default function LibraryTab() {
  const { user, profile } = useAuth();
  const [savedPosts, setSavedPosts] = useState<SavedPostEntry[] | null>(null);
  // Beta feedback: "We need a clear library button and select book feature to remove particular books
  // from library and history." Select mode: tap covers to tick them, then remove the ticked titles.
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setPicked(new Set());
  }
  /** In select mode a tap on a cover ticks it instead of opening the title. */
  function cardClick(e: React.MouseEvent, id: string) {
    if (!selectMode) return;
    e.preventDefault();
    toggle(id);
  }

  useEffect(() => {
    if (!user) {
      setSavedPosts([]);
      return;
    }
    getSavedPosts(user.uid)
      .then(setSavedPosts)
      .catch(() => setSavedPosts([]));
  }, [user]);
  const readingProgress = profile?.readingProgress ?? {};
  // Most-recently-updated entry is "the one you're actively reading" — it gets the Now Reading badge.
  const currentlyReading = Object.entries(readingProgress).sort((a, b) =>
    (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? "")
  );
  const nowReadingId = currentlyReading[0]?.[0];
  const readingList = profile?.readingList ?? [];
  const { items: bookmarked, loading } = useMangaSummaries(readingList);
  const libraryIds = Array.from(new Set([...currentlyReading.map(([id]) => id), ...readingList]));

  async function handleRemoveSelected() {
    if (!user || picked.size === 0) return;
    setBusy(true);
    try {
      await removeFromLibrary(user.uid, Array.from(picked));
      toast.success(`Removed ${picked.size} title${picked.size === 1 ? "" : "s"} from your library.`);
      exitSelect();
    } catch {
      toast.error("Couldn't remove those titles. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearLibrary() {
    if (!user) return;
    setBusy(true);
    try {
      await clearLibrary(user.uid);
      setClearOpen(false);
      exitSelect();
      toast.success("Library cleared.");
    } catch {
      toast.error("Couldn't clear your library. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const tick = (id: string) =>
    selectMode ? (
      <span
        data-testid="lib-check"
        data-checked={picked.has(id) ? "true" : "false"}
        className={`absolute right-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
          picked.has(id) ? "border-clay bg-clay text-ivory" : "border-white/70 bg-black/40 text-transparent"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    ) : null;

  return (
    <div className="flex flex-col gap-10">
      {libraryIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bg4 bg-bg2 px-3 py-2" data-testid="library-toolbar">
          {selectMode ? (
            <>
              <span className="font-noto text-sm text-text" data-testid="library-selected-count">{picked.size} selected</span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setPicked(new Set(libraryIds))} className="btn-ghost text-xs">
                  Select all
                </button>
                <button
                  type="button"
                  onClick={handleRemoveSelected}
                  disabled={busy || picked.size === 0}
                  data-testid="library-remove-selected"
                  className="inline-flex items-center gap-1.5 rounded-full bg-clay px-3.5 py-1.5 font-syne text-xs font-semibold text-ivory disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
                </button>
                <button type="button" onClick={exitSelect} aria-label="Cancel selection" className="text-muted hover:text-text">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="font-noto text-xs text-muted">{libraryIds.length} title{libraryIds.length === 1 ? "" : "s"} in your library</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSelectMode(true)} data-testid="library-select" className="btn-ghost inline-flex items-center gap-1.5 text-xs">
                  <CheckSquare className="h-3.5 w-3.5" /> Select
                </button>
                <button
                  type="button"
                  onClick={() => setClearOpen(true)}
                  data-testid="library-clear"
                  className="inline-flex items-center gap-1.5 rounded-full border border-clay/50 px-3 py-1.5 font-noto text-xs font-semibold text-clay2 hover:bg-clay/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear library
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Currently Reading</h3>
        {currentlyReading.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6 text-muted" />}
            title="Nothing in progress"
            description="Start a series and your progress will show up here."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {currentlyReading.map(([mangaId, entry]) => (
              <div key={mangaId} className="group relative">
                {tick(mangaId)}
                {mangaId === nowReadingId && !selectMode && (
                  <Link
                    href={`/reader?id=${encodeURIComponent(mangaId)}&chapter=${entry.chapterIndex}`}
                    className="absolute left-1.5 top-1.5 z-10 flex animate-pulse items-center gap-1 rounded-full bg-clay px-2 py-0.5 font-syne text-[10px] font-bold text-ivory shadow-lg"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-ivory" />
                    Now Reading
                  </Link>
                )}
                <Link href={`/manga/${encodeURIComponent(mangaId)}`} onClick={(e) => cardClick(e, mangaId)}>
                  <div className="aspect-[3/4] overflow-hidden rounded-xl border border-bg4 bg-bg2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
            loading="lazy"
                      src={proxyImg(entry.coverURL)}
                      alt={entry.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg4">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-clay to-gold"
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 truncate font-syne text-xs font-semibold text-text">
                    {entry.title}
                  </p>
                  <p className="truncate font-noto text-[11px] text-muted">{entry.chapterLabel}</p>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Bookmarked</h3>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : bookmarked.length === 0 ? (
          <EmptyState
            icon={<span className="text-4xl">📚</span>}
            title="Your Library is Empty"
            description="Start reading to add titles here."
            action={
              <Link href="/reader" className="btn-primary">
                Browse Manga
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {bookmarked.map((item) => (
              <Link key={item.id} href={`/manga/${encodeURIComponent(item.id)}`} className="group relative" onClick={(e) => cardClick(e, item.id)}>
                {tick(item.id)}
                <div className="aspect-[3/4] overflow-hidden rounded-xl border border-bg4 bg-bg2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
            loading="lazy"
                    src={proxyImg(item.image)}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="mt-2 truncate font-syne text-xs font-semibold text-text">{item.title}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-4 flex items-center gap-2 font-syne text-sm font-semibold text-text">
          <Bookmark className="h-4 w-4" /> Saved Posts
        </h3>
        {savedPosts === null ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : savedPosts.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="h-6 w-6 text-muted" />}
            title="No Saved Posts"
            description="Bookmark a post from the feed to find it here."
            action={
              <Link href="/feed" className="btn-primary">
                Go to Feed
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {savedPosts.map((post) => (
              <Link key={post.postId} href={`/feed/${post.postId}`} className="group overflow-hidden rounded-xl border border-bg4 bg-bg2">
                <div className="aspect-[3/4] overflow-hidden bg-bg3">
                  {(post.videoUrl ? getVideoThumbnail(post.videoUrl) : post.videoPosterUrl) || post.attachments[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      loading="lazy"
                      src={proxyImg(
                        (post.videoUrl ? getVideoThumbnail(post.videoUrl) : post.videoPosterUrl) || post.attachments[0]
                      )}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-3 text-center font-noto text-xs text-muted">
                      {post.content.slice(0, 60)}
                    </div>
                  )}
                </div>
                <p className="truncate p-2 font-noto text-[11px] text-muted">{post.displayName}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <DownloadsSection />

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title="Clear your library?">
        <div className="flex flex-col gap-4">
          <p className="font-noto text-sm text-text">
            This removes every bookmarked title and every in-progress series from your library. Your reading history and coins are
            not touched.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setClearOpen(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClearLibrary}
              disabled={busy}
              data-testid="library-clear-confirm"
              className="inline-flex items-center gap-2 rounded-full bg-clay px-5 py-2.5 font-syne text-sm font-semibold text-ivory hover:bg-clay2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Clear library
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
