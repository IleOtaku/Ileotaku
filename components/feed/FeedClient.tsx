"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUp, Flame, Music, Video, X } from "lucide-react";
import FeedPostCard from "./FeedPostCard";
import PostComposer from "./PostComposer";
import { EmptyState, Skeleton, Tabs } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers } from "@/lib/blocking";
import {
  expireBoosts,
  getFollowingFeed,
  getForYouFeed,
  subscribeToFeed,
  type FeedPage,
} from "@/lib/creatorFeed";
import type { CreatorPost } from "@/types";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

type FeedTab = "forYou" | "following";
type Cursor = QueryDocumentSnapshot<DocumentData> | null;
type FeedFilter = "all" | "hasSound" | "hasVideo" | "africanBeats" | "noSound";

const PAGE_SIZE = 10;

const FEED_FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hasSound", label: "Has Sound" },
  { value: "hasVideo", label: "Video" },
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
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  // A specific sound clicked from Explore's Trending Sounds (?sound=<id>) overrides the chip
  // row entirely, showing only posts using that exact sound rather than a whole category.
  const [specificSound, setSpecificSound] = useState<{ id: string; title: string } | null>(null);
  // Posts a live subscription has seen but not yet shown — surfaced as a "new posts" banner
  // instead of silently reshuffling the list a reader might be mid-scroll through.
  const [pendingPosts, setPendingPosts] = useState<CreatorPost[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const followingIds = profile?.following ?? [];
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());

  // Feed queries have no way to exclude an arbitrary per-viewer set of authors, so blocked
  // users' posts are filtered out client-side, same pattern as CommentSection.
  useEffect(() => {
    if (!user) {
      setBlockedUids(new Set());
      return;
    }
    getBlockedUsers(user.uid).then((uids) => setBlockedUids(new Set(uids)));
  }, [user]);

  useEffect(() => {
    const soundId = searchParams.get("sound");
    if (soundId) setSpecificSound({ id: soundId, title: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boosts are time-limited — sweeping expired ones on mount keeps the For You ranking honest
  // without needing a scheduled Cloud Function (this project has none deployed). Gated on
  // `user` (not just `!authLoading`) since creatorFeed reads require isSignedIn(); a signed-out
  // visitor would otherwise generate a harmless-but-noisy permission-denied log entry every time
  // they open /feed for a sweep that only ever benefits authors of boosted posts.
  useEffect(() => {
    if (user) expireBoosts();
  }, [user]);

  const visiblePosts = useMemo(() => {
    const unblocked = posts.filter((p) => !blockedUids.has(p.uid));
    if (specificSound) return unblocked.filter((p) => p.soundId === specificSound.id);
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
  }, [posts, feedFilter, specificSound, blockedUids]);

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
            : await getForYouFeed(PAGE_SIZE);
        setPosts(page.posts);
        setCursor(page.lastDoc);
        setHasMore(page.posts.length === PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    },
    // followingIds intentionally compared by identity via profile — re-runs when the profile object changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile]
  );

  useEffect(() => {
    if (authLoading) return;
    loadFirstPage(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authLoading, loadFirstPage]);

  // Real-time: watch the newest page of the overall feed and queue anything not already shown
  // (filtered to followed creators when on the Following tab) into `pendingPosts` rather than
  // auto-prepending it — a "New posts available" banner lets the reader pull them in on their
  // own terms instead of the list jumping under them mid-scroll.
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
  }, [tab, authLoading, profile, blockedUids]);

  function showPendingPosts() {
    setPosts((current) => {
      const knownIds = new Set(current.map((p) => p.id));
      return [...pendingPosts.filter((p) => !knownIds.has(p.id)), ...current];
    });
    setPendingPosts([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadMore() {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page =
        tab === "following"
          ? await getFollowingFeed(followingIds, PAGE_SIZE, cursor)
          : await getForYouFeed(PAGE_SIZE, cursor);
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
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, hasMore, loadingMore, tab]);

  function handleDeleted(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  /** The "Be the First" empty state's CTA — scrolls PostComposer into view and opens it. If it's
   * already expanded this just focuses the textarea directly; if still collapsed, clicking its
   * "Share an update..." button expands it, which autoFocuses the textarea on its own. */
  function focusComposer() {
    const composer = document.getElementById("post-composer");
    if (!composer) return;
    composer.scrollIntoView({ behavior: "smooth", block: "center" });
    const textarea = composer.querySelector<HTMLTextAreaElement>("textarea");
    if (textarea) {
      textarea.focus();
    } else {
      composer.querySelector<HTMLButtonElement>("button")?.click();
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Flame className="h-6 w-6 text-clay2" />
        <h1 className="font-cinzel text-2xl text-text">Creator Feed</h1>
      </div>

      <Tabs
        tabs={[
          { label: "For You", value: "forYou" },
          { label: "Following", value: "following" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as FeedTab)}
      />

      <div className="mt-6 flex flex-col gap-4">
        {user && <PostComposer onPosted={() => loadFirstPage(tab)} />}

        {pendingPosts.length > 0 && (
          <button
            type="button"
            onClick={showPendingPosts}
            className="flex items-center justify-center gap-2 self-center rounded-full border border-clay bg-clay/15 px-4 py-1.5 font-noto text-xs font-semibold text-clay2 shadow-lg"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            {pendingPosts.length === 1 ? "1 new post" : `${pendingPosts.length} new posts`} — tap to show
          </button>
        )}

        {specificSound ? (
          <div className="flex items-center justify-between gap-3 rounded-full border border-clay/40 bg-clay/10 px-4 py-2">
            <span className="flex items-center gap-2 font-noto text-xs text-clay2">
              <Music className="h-3.5 w-3.5" /> Showing posts using this sound
            </span>
            <button
              type="button"
              onClick={() => setSpecificSound(null)}
              className="flex items-center gap-1 font-noto text-xs text-muted hover:text-clay2"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {FEED_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFeedFilter(f.value)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 font-noto text-xs transition-colors ${
                  feedFilter === f.value
                    ? "border-clay bg-clay/15 text-clay2"
                    : "border-muted2 bg-bg3 text-muted hover:border-clay"
                }`}
              >
                {f.value === "hasVideo" && <Video className="h-3 w-3" />}
                {f.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          tab === "following" ? (
            <EmptyState
              icon={<span className="text-4xl">📭</span>}
              title="Nobody Here Yet"
              description="Follow creators to see their posts."
              action={
                <Link href="/search?tab=people&filter=creators" className="btn-primary">
                  Browse Creators
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={<span className="text-4xl">🔥</span>}
              title="Be the First"
              description="No posts yet — create one!"
              action={
                <button type="button" onClick={focusComposer} className="btn-primary">
                  Share an Update
                </button>
              }
            />
          )
        ) : visiblePosts.length === 0 ? (
          <EmptyState
            icon={<Music className="h-6 w-6 text-muted" />}
            title="No posts match this filter"
            description="Try a different sound filter, or check back once more creators post."
          />
        ) : (
          <>
            {visiblePosts.map((post) => (
              <FeedPostCard key={post.id} post={post} onDeleted={handleDeleted} />
            ))}
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && <Skeleton className="h-40 w-full rounded-2xl" />}
            {!hasMore && posts.length > 0 && (
              <p className="py-6 text-center font-noto text-xs text-muted">You&apos;re all caught up.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
