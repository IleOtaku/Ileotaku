"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUp, Plus, Sparkles, UsersRound } from "lucide-react";
import TikTokFeedItem from "./TikTokFeedItem";
import PostComposer from "./PostComposer";
import FeedSoundToggle from "./FeedSoundToggle";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers } from "@/lib/blocking";
import {
  expireBoosts,
  getFollowingFeed,
  getForYouFeed,
  subscribeToFeed,
  subscribeToSavedPostIds,
  type FeedPage,
} from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

type FeedTab = "forYou" | "following";
type FeedFilter = "all" | "hasSound" | "hasVideo" | "africanBeats" | "noSound";
type Cursor = QueryDocumentSnapshot<DocumentData> | null;

const PAGE_SIZE = 10;

const FEED_FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hasVideo", label: "Video" },
  { value: "hasSound", label: "Has Sound" },
  { value: "africanBeats", label: "African Beats" },
  { value: "noSound", label: "No Sound" },
];

export default function FeedClient() {
  const { user, profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<FeedTab>(() =>
    searchParams.get("tab") === "following" ? "following" : "forYou"
  );
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingPosts, setPendingPosts] = useState<CreatorPost[]>([]);
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const followingIds = profile?.following ?? [];
  // Beta feedback bug: "Page reloads after each comment sent." Root cause — addFeedComment (and
  // sendDM, chapter reads, etc.) calls updateLastActive() on every action, which writes
  // lastActiveAt to the viewer's OWN user doc. loadFirstPage below was keyed on the whole
  // `profile` object (to react to the follow list changing for the "Following" tab), so that
  // unrelated write produced a new `profile` reference, which gave loadFirstPage a new identity,
  // which re-ran the effect below and wiped+refetched the entire feed from scratch after every
  // single comment. Depending on this joined, value-compared string instead of `profile` itself
  // means the callback's identity — and the refetch — now only changes when the follow list
  // actually does.
  const followingKey = followingIds.join(",");

  useEffect(() => {
    if (!user) {
      setBlockedUids(new Set());
      return;
    }
    getBlockedUsers(user.uid).then((uids) => setBlockedUids(new Set(uids)));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSavedIds(new Set());
      return;
    }
    return subscribeToSavedPostIds(user.uid, setSavedIds);
  }, [user]);

  useEffect(() => {
    if (user) expireBoosts();
  }, [user]);

  const visiblePosts = useMemo(() => {
    const unblocked = posts.filter((p) => !blockedUids.has(p.uid));
    switch (feedFilter) {
      case "hasSound":
        return unblocked.filter((p) => !!p.soundId);
      case "hasVideo":
        return unblocked.filter((p) => p.mediaType === "video");
      case "africanBeats":
        return unblocked.filter((p) => p.soundCategory === "African Beats");
      case "noSound":
        return unblocked.filter((p) => !p.soundId);
      default:
        return unblocked;
    }
  }, [posts, blockedUids, feedFilter]);

  const loadFirstPage = useCallback(
    async (activeTab: FeedTab) => {
      setLoading(true);
      setPosts([]);
      setPendingPosts([]);
      setCursor(null);
      setHasMore(true);
      try {
        const page: FeedPage =
          activeTab === "following"
            ? await getFollowingFeed(followingIds, PAGE_SIZE)
            : await getForYouFeed(PAGE_SIZE, null, { followingIds, viewerUid: user?.uid });
        setPosts(page.posts);
        setCursor(page.lastDoc);
        setHasMore(page.posts.length === PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.uid, followingKey]
  );

  useEffect(() => {
    if (authLoading) return;
    loadFirstPage(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authLoading, loadFirstPage]);

  useEffect(() => {
    if (authLoading) return;
    const unsub = subscribeToFeed((latest) => {
      setPosts((current) => {
        const knownIds = new Set(current.map((p) => p.id));
        setPendingPosts((prevPending) => {
          const pendingIds = new Set(prevPending.map((p) => p.id));
          const fresh = latest.filter((p) => {
            if (knownIds.has(p.id) || pendingIds.has(p.id)) return false;
            if (blockedUids.has(p.uid)) return false;
            if (tab === "following") return followingIds.includes(p.uid);
            return true;
          });
          if (fresh.length === 0) return prevPending;
          return [...fresh, ...prevPending];
        });
        return current;
      });
    }, PAGE_SIZE);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authLoading, followingKey, blockedUids]);

  function showPendingPosts() {
    setPosts((current) => {
      const knownIds = new Set(current.map((p) => p.id));
      return [...pendingPosts.filter((p) => !knownIds.has(p.id)), ...current];
    });
    setPendingPosts([]);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadMore() {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page =
        tab === "following"
          ? await getFollowingFeed(followingIds, PAGE_SIZE, cursor)
          : await getForYouFeed(PAGE_SIZE, cursor, { followingIds, viewerUid: user?.uid });
      setPosts((prev) => {
        const knownIds = new Set(prev.map((p) => p.id));
        return [...prev, ...page.posts.filter((p) => !knownIds.has(p.id))];
      });
      setCursor(page.lastDoc);
      setHasMore(page.posts.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!el || !root) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      root,
      rootMargin: "200% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, hasMore, loadingMore, tab]);

  function handleDeleted(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  return (
    <div className="flex h-[100dvh] w-full bg-black">
      {/* ---------------------------- Left sidebar (desktop) ---------------------------- */}
      <aside className="hidden w-56 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/10 p-4 lg:flex">
        <Link href="/" className="flex items-center gap-1.5 font-cinzel text-lg font-bold text-gold">
          <ArrowLeft className="h-4 w-4" /> ÍléOtaku
        </Link>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setTab("forYou")}
            className={`rounded-lg px-3 py-2 text-left font-syne text-sm font-semibold ${tab === "forYou" ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}
          >
            For You
          </button>
          <button
            type="button"
            onClick={() => setTab("following")}
            className={`rounded-lg px-3 py-2 text-left font-syne text-sm font-semibold ${tab === "following" ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}
          >
            Following
          </button>
        </div>

        <div>
          <p className="mb-2 font-syne text-xs font-bold uppercase tracking-wide text-white/40">Filter</p>
          <div className="flex flex-col gap-1">
            {FEED_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFeedFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-left font-noto text-xs ${
                  feedFilter === f.value ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {user && (
          <button type="button" onClick={() => setComposerOpen(true)} className="btn-primary justify-center text-sm">
            <Plus className="h-4 w-4" /> Create
          </button>
        )}
      </aside>

      {/* ---------------------------- Center feed column ---------------------------- */}
      <div className="relative flex flex-1 justify-center overflow-hidden">
        {/* Beta feedback bug: mobile had no way to leave the feed at all — the desktop-only left
            sidebar (hidden below lg) is the only place a back-to-home link exists. This mirrors
            it for mobile, top-left, always visible above the scrolling posts. */}
        <Link
          href="/"
          aria-label="Back to home"
          className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="absolute right-3 top-3 z-30 flex items-center gap-2 lg:hidden">
          <FeedSoundToggle />
          {/* Beta feedback bug: this used to float at bottom-right, directly overlapping
              TikTokFeedItem's own like/comment/share/save rail in that same corner ("the create
              post icon is on the other control for the feed videos on mobile"). Moved up into the
              top-right icon row, clear of every post's action rail. */}
          {user && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              aria-label="Create post"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-clay text-ivory shadow-lg"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="absolute right-3 top-3 z-30 hidden lg:flex">
          <FeedSoundToggle />
        </div>

        {/* Mobile-only top tab row (desktop uses the left sidebar instead). */}
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 gap-1 rounded-full bg-black/40 p-1 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setTab("forYou")}
            className={`rounded-full px-3 py-1 font-syne text-xs font-semibold ${tab === "forYou" ? "bg-white text-black" : "text-white/70"}`}
          >
            For You
          </button>
          <button
            type="button"
            onClick={() => setTab("following")}
            className={`rounded-full px-3 py-1 font-syne text-xs font-semibold ${tab === "following" ? "bg-white text-black" : "text-white/70"}`}
          >
            Following
          </button>
        </div>

        {pendingPosts.length > 0 && (
          <button
            type="button"
            onClick={showPendingPosts}
            className="absolute top-12 z-30 flex items-center gap-2 self-center rounded-full border border-clay bg-clay px-4 py-1.5 font-noto text-xs font-semibold text-ivory shadow-lg"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            {pendingPosts.length === 1 ? "1 new post" : `${pendingPosts.length} new posts`}
          </button>
        )}

        <div
          ref={scrollContainerRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll md:my-4 md:max-w-[480px] md:rounded-2xl"
        >
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
              {tab === "following" ? (
                <>
                  <UsersRound className="h-8 w-8 text-white/50" />
                  <p className="font-cinzel text-lg">Nobody here yet</p>
                  <p className="font-noto text-sm text-white/60">Follow creators to see their posts.</p>
                  <Link href="/search?tab=people&filter=creators" className="btn-primary">
                    Browse Creators
                  </Link>
                </>
              ) : (
                <>
                  <Sparkles className="h-8 w-8 text-white/50" />
                  <p className="font-cinzel text-lg">Be the first</p>
                  <p className="font-noto text-sm text-white/60">No posts yet — create one!</p>
                  {user && (
                    <button type="button" onClick={() => setComposerOpen(true)} className="btn-primary">
                      Share an Update
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {visiblePosts.map((post) => (
                <TikTokFeedItem key={post.id} post={post} isSaved={savedIds.has(post.id)} onDeleted={handleDeleted} />
              ))}
              <div ref={sentinelRef} className="h-1" />
              {loadingMore && (
                <div className="flex h-24 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={composerOpen} onClose={() => setComposerOpen(false)} title="Create Post">
        <PostComposer
          onPosted={() => {
            setComposerOpen(false);
            loadFirstPage(tab);
          }}
        />
      </Modal>
    </div>
  );
}
