"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, ChevronLeft, ChevronRight, Coins, Lock, Loader2, Settings2 } from "lucide-react";
import CommentSection from "@/components/social/CommentSection";
import { Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { checkAndAwardAchievements } from "@/lib/achievements";
import {
  getLockConfig,
  isChapterUnlocked,
  unlockChapterWithCoins,
  type LockConfig,
} from "@/lib/contentLocking";
import {
  addHistoryEntry,
  getUserProfile,
  updateHistoryReadingTime,
  updateReadingProgress,
  updateUserPrefs,
} from "@/lib/firestore";
import { getPublishedSeries, getSeriesChapters, incrementSeriesReads } from "@/lib/publishedSeries";
import { clearReadingActivity, updateReadingActivity } from "@/lib/readingActivity";
import type { PublishedChapter, PublishedSeries } from "@/types";

export interface ProseReaderClientProps {
  workId: string;
}

type FontSize = "sm" | "md" | "lg" | "xl";
type LineSpacing = "compact" | "normal" | "relaxed";
type PageTheme = "cream" | "dark";

const FONT_SIZE_CLASS: Record<FontSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
  xl: "text-2xl",
};
const LINE_SPACING_CLASS: Record<LineSpacing, string> = {
  compact: "leading-normal",
  normal: "leading-relaxed",
  relaxed: "leading-loose",
};
const PAGE_THEME_CLASS: Record<PageTheme, { bg: string; text: string; muted: string; card: string }> = {
  cream: { bg: "bg-[#f4ecd8]", text: "text-[#3b2f1f]", muted: "text-[#7a6a4f]", card: "bg-[#fdf9ef]" },
  dark: { bg: "bg-[#121009]", text: "text-[#e8ddd0]", muted: "text-[#a3947e]", card: "bg-[#1a1510]" },
};

const PREFS_KEY = "ileotaku-prose-prefs";

interface ProsePrefs {
  fontSize: FontSize;
  lineSpacing: LineSpacing;
  theme: PageTheme;
}

const DEFAULT_PROSE_PREFS: ProsePrefs = { fontSize: "md", lineSpacing: "normal", theme: "cream" };

function loadProsePrefs(): ProsePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PROSE_PREFS, ...JSON.parse(raw) } : DEFAULT_PROSE_PREFS;
  } catch {
    return DEFAULT_PROSE_PREFS;
  }
}

/** Parses a chapter's plain-text content into paragraphs (split on a blank line, matching how
 * AddProseChapterModal's paragraph-break toolbar button inserts breaks), each rendered with its
 * double-asterisk (bold) and single-asterisk (italic) markers turned into real strong/em tags. */
function renderParagraph(
  text: string,
  key: number,
  ref?: (el: HTMLParagraphElement | null) => void
) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((t) => t.length > 0);
  return (
    <p key={key} ref={ref} className="mb-5">
      {tokens.map((token, i) => {
        if (token.startsWith("**") && token.endsWith("**")) {
          return <strong key={i}>{token.slice(2, -2)}</strong>;
        }
        if (token.startsWith("*") && token.endsWith("*")) {
          return <em key={i}>{token.slice(1, -1)}</em>;
        }
        return <span key={i}>{token}</span>;
      })}
    </p>
  );
}

/**
 * Prose (Wattpad-style) chapter reader — a dedicated, text-only counterpart to app/reader's
 * image-page viewer, since a prose work's chapters carry `content` instead of `images` (see
 * types/index.ts's PublishedChapter). Locking reuses the exact same lib/contentLocking.ts
 * machinery the manga reader's ImportedContentGate does (a chapter's own author-set coinPrice,
 * Platinum bypass), just rendered as an inline text-blur gate instead of an image backdrop.
 */
export default function ProseReaderClient({ workId }: ProseReaderClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();

  const [series, setSeries] = useState<PublishedSeries | null>(null);
  const [chapters, setChapters] = useState<PublishedChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [prefs, setPrefs] = useState<ProsePrefs>(DEFAULT_PROSE_PREFS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const [gate, setGate] = useState<{ status: "checking" | "open" | "locked"; config?: LockConfig }>({
    status: "checking",
  });
  const [balance, setBalance] = useState(0);
  const [unlocking, setUnlocking] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const furthestParagraphRef = useRef(0);
  const initializedFromUrl = useRef(false);
  const recordedRef = useRef<Set<string>>(new Set());
  const historyTrackingRef = useRef<{ id: string; startedAt: number } | null>(null);

  useEffect(() => {
    setPrefs(loadProsePrefs());
  }, []);

  function updatePrefs(next: Partial<ProsePrefs>) {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch {
        // Non-fatal — the picked prefs still apply for the rest of this session.
      }
      return merged;
    });
  }

  // ---- Load the series + its chapters once ----
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getPublishedSeries(workId), getSeriesChapters(workId)]).then(([s, c]) => {
      if (cancelled) return;
      setSeries(s);
      setChapters(c);
      if (!initializedFromUrl.current) {
        initializedFromUrl.current = true;
        const chapterParam = Number(searchParams.get("chapter"));
        setChapterIndex(
          Number.isInteger(chapterParam) && chapterParam >= 0 && chapterParam < c.length
            ? chapterParam
            : Math.max(0, c.length - 1)
        );
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId]);

  const currentChapter = chapters[chapterIndex];
  const isFirstChapter = chapterIndex === 0;
  const isLastChapter = chapterIndex >= chapters.length - 1;
  const paragraphs = useMemo(
    () => (currentChapter?.content ? currentChapter.content.split(/\n{2,}/).filter((p) => p.trim()) : []),
    [currentChapter]
  );

  useEffect(() => {
    setBalance(profile?.coins ?? 0);
  }, [profile?.coins]);

  // ---- Chapter lock check — mirrors ImportedContentGate exactly, minus the ad path (creator
  // content is never ad-gated, only coin-gated by its own author). ----
  useEffect(() => {
    if (!currentChapter) return;
    let cancelled = false;
    setGate({ status: "checking" });
    (async () => {
      const config = await getLockConfig(workId, chapterIndex, "creator", profile, currentChapter.coinPrice);
      if (cancelled) return;
      if (!config.locked) {
        setGate({ status: "open" });
        return;
      }
      const unlockKey = `creator:${workId}:${currentChapter.id}`;
      if (profile?.uid) {
        const already = await isChapterUnlocked(profile.uid, unlockKey);
        if (cancelled) return;
        if (already) {
          setGate({ status: "open" });
          return;
        }
      }
      setGate({ status: "locked", config });
    })();
    return () => {
      cancelled = true;
    };
  }, [workId, chapterIndex, currentChapter, profile]);

  async function handleUnlock() {
    if (!profile?.uid || !currentChapter || !gate.config) return;
    setUnlocking(true);
    try {
      const unlockKey = `creator:${workId}:${currentChapter.id}`;
      const result = await unlockChapterWithCoins(profile.uid, workId, unlockKey, gate.config.coinPrice ?? 0);
      if (result.success) {
        setBalance((b) => b - (gate.config?.coinPrice ?? 0));
        setGate({ status: "open" });
      } else {
        toast.error(result.message ?? "Couldn't unlock this chapter.");
      }
    } finally {
      setUnlocking(false);
    }
  }

  // ---- Scroll progress + paragraph-level bookmark tracking ----
  useEffect(() => {
    furthestParagraphRef.current = 0;
    function handleScroll() {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = total > 0 ? Math.min(100, Math.max(0, Math.round((-rect.top / total) * 100))) : 0;
      setProgress(scrolled);

      paragraphRefs.current.forEach((p, i) => {
        if (!p) return;
        if (p.getBoundingClientRect().top < window.innerHeight * 0.6) {
          furthestParagraphRef.current = Math.max(furthestParagraphRef.current, i);
        }
      });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [chapterIndex, gate.status]);

  // ---- Record a read + history + bookmark once the chapter is actually open ----
  useEffect(() => {
    if (!user || !series || !currentChapter || gate.status !== "open") return;
    const key = `${workId}:${currentChapter.id}`;
    if (recordedRef.current.has(key)) return;
    recordedRef.current.add(key);

    const uid = user.uid;
    incrementSeriesReads(workId);
    (async () => {
      try {
        const freshProfile = await getUserProfile(uid);
        const chaptersRead = (freshProfile?.chaptersRead ?? 0) + 1;
        await updateUserPrefs(uid, { chaptersRead });
        const historyId = await addHistoryEntry(uid, {
          mangaId: workId,
          title: series.title,
          coverURL: series.coverImage,
          chapterLabel: currentChapter.title || `Chapter ${currentChapter.chapterNumber}`,
        });
        historyTrackingRef.current = { id: historyId, startedAt: Date.now() };
        if (freshProfile?.showReadingActivity !== false) {
          updateReadingActivity(
            uid,
            workId,
            series.title,
            currentChapter.id,
            currentChapter.title || `Chapter ${currentChapter.chapterNumber}`,
            series.coverImage
          );
        }
        if (freshProfile) await checkAndAwardAchievements(uid, { ...freshProfile, chaptersRead });
      } catch {
        // Non-fatal — reading still works even if progress/achievement tracking fails.
      }
    })();
  }, [user, series, currentChapter, gate.status, workId]);

  // Saves the furthest-read paragraph as this work's bookmark whenever the chapter changes or
  // the reader leaves — mirrors ReaderClient's history-time back-fill-on-leave pattern.
  useEffect(() => {
    return () => {
      if (!user || !currentChapter) return;
      const tracking = historyTrackingRef.current;
      if (tracking) {
        const minutes = Math.round((Date.now() - tracking.startedAt) / 60_000);
        if (minutes > 0) updateHistoryReadingTime(user.uid, tracking.id, minutes);
      }
      updateReadingProgress(user.uid, workId, {
        title: series?.title ?? "",
        coverURL: series?.coverImage ?? "",
        chapterIndex,
        chapterLabel: currentChapter.title || `Chapter ${currentChapter.chapterNumber}`,
        totalChapters: chapters.length,
        progress: chapters.length > 0 ? (chapterIndex + 1) / chapters.length : 0,
        updatedAt: new Date().toISOString(),
        paragraphIndex: furthestParagraphRef.current,
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIndex, user, workId]);

  useEffect(() => {
    return () => {
      if (user) clearReadingActivity(user.uid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const goToChapter = useCallback(
    (index: number) => {
      setChapterIndex(index);
      paragraphRefs.current = [];
      window.scrollTo({ top: 0 });
      router.replace(`/story/${workId}?chapter=${index}`, { scroll: false });
    },
    [router, workId]
  );

  const palette = PAGE_THEME_CLASS[prefs.theme];

  if (loading) {
    return (
      <div className={`min-h-screen ${palette.bg} p-6`}>
        <Skeleton className="mx-auto h-8 w-2/3 max-w-xl" />
        <Skeleton className="mx-auto mt-6 h-96 w-full max-w-2xl" />
      </div>
    );
  }

  if (!series || !currentChapter) {
    return (
      <div className={`flex min-h-screen flex-col items-center justify-center gap-3 ${palette.bg} ${palette.text} p-6 text-center`}>
        <span className="text-4xl">📖</span>
        <h1 className="font-cinzel text-xl">This story couldn&apos;t be found</h1>
        <Link href="/reader" className="btn-primary">
          Back to Browse
        </Link>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${palette.bg} ${palette.text}`}>
      <div className="fixed inset-x-0 top-0 z-20 h-1 bg-black/10">
        <div className="h-full bg-clay transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <header
        className={`sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur ${palette.card}`}
        style={{ borderColor: prefs.theme === "dark" ? "#2a2218" : "#d9c9a3" }}
      >
        <Link href={`/manga/${workId}`} className="shrink-0" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-syne text-sm font-semibold">{series.title}</p>
          <p className={`truncate font-noto text-xs ${palette.muted}`}>
            {currentChapter.title || `Chapter ${currentChapter.chapterNumber}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-label="Reading settings"
          className="shrink-0 rounded-full p-2 hover:bg-black/5"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </header>

      {settingsOpen && (
        <div className={`border-b px-4 py-4 ${palette.card}`} style={{ borderColor: prefs.theme === "dark" ? "#2a2218" : "#d9c9a3" }}>
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <div>
              <p className={`mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide ${palette.muted}`}>
                Font Size
              </p>
              <div className="flex gap-2">
                {(["sm", "md", "lg", "xl"] as FontSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => updatePrefs({ fontSize: size })}
                    className={`rounded-full border px-3 py-1 font-noto text-xs ${
                      prefs.fontSize === size ? "border-clay bg-clay text-ivory" : "border-current/20"
                    }`}
                  >
                    {size === "sm" ? "Small" : size === "md" ? "Medium" : size === "lg" ? "Large" : "XL"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={`mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide ${palette.muted}`}>
                Line Spacing
              </p>
              <div className="flex gap-2">
                {(["compact", "normal", "relaxed"] as LineSpacing[]).map((spacing) => (
                  <button
                    key={spacing}
                    type="button"
                    onClick={() => updatePrefs({ lineSpacing: spacing })}
                    className={`rounded-full border px-3 py-1 font-noto text-xs capitalize ${
                      prefs.lineSpacing === spacing ? "border-clay bg-clay text-ivory" : "border-current/20"
                    }`}
                  >
                    {spacing}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={`mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide ${palette.muted}`}>
                Background
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updatePrefs({ theme: "cream" })}
                  className={`rounded-full border px-3 py-1 font-noto text-xs ${
                    prefs.theme === "cream" ? "border-clay bg-clay text-ivory" : "border-current/20"
                  }`}
                >
                  Cream
                </button>
                <button
                  type="button"
                  onClick={() => updatePrefs({ theme: "dark" })}
                  className={`rounded-full border px-3 py-1 font-noto text-xs ${
                    prefs.theme === "dark" ? "border-clay bg-clay text-ivory" : "border-current/20"
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-6 flex items-center gap-3">
          <Avatar uid={series.authorId} photoURL={series.authorPhotoURL} displayName={series.authorName} size={36} />
          <div className="min-w-0">
            <p className="truncate font-syne text-sm font-semibold">{series.authorName}</p>
            <p className={`font-noto text-xs ${palette.muted}`}>
              {(currentChapter.wordCount ?? 0).toLocaleString()} words · ~{currentChapter.estimatedReadTime ?? 1} min
              read
            </p>
          </div>
        </div>

        {gate.status === "checking" ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className={`font-noto text-sm ${palette.muted}`}>Checking chapter access...</p>
          </div>
        ) : gate.status === "locked" ? (
          <div className="relative overflow-hidden rounded-2xl border border-current/10 py-16">
            <div className="pointer-events-none select-none px-6 text-justify blur-sm">
              {paragraphs.slice(0, 2).map((p, i) => renderParagraph(p, i))}
            </div>
            <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center ${palette.card}/90`}>
              <Lock className="h-6 w-6 text-clay2" />
              <p className="font-cinzel text-lg">{currentChapter.title || `Chapter ${currentChapter.chapterNumber}`}</p>
              <p className={`font-noto text-sm ${palette.muted}`}>Unlock for {gate.config?.coinPrice ?? 0} coins</p>
              <p className={`flex items-center gap-1.5 font-noto text-xs ${palette.muted}`}>
                <Coins className="h-3.5 w-3.5 text-gold" /> Your balance: {balance} coins
              </p>
              <button type="button" onClick={handleUnlock} disabled={unlocking} className="btn-primary">
                {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : `Unlock for ${gate.config?.coinPrice ?? 0} 🪙`}
              </button>
              <Link href="/pricing" className="font-noto text-xs font-semibold text-plat2 hover:underline">
                Or go Platinum for unlimited reading 💎
              </Link>
            </div>
          </div>
        ) : (
          <div
            ref={contentRef}
            className={`font-serif ${FONT_SIZE_CLASS[prefs.fontSize]} ${LINE_SPACING_CLASS[prefs.lineSpacing]} text-justify`}
          >
            {paragraphs.map((p, i) => renderParagraph(p, i, (el) => { paragraphRefs.current[i] = el; }))}
          </div>
        )}

        <div className="mt-10 flex items-center justify-between gap-3 border-t border-current/10 pt-6">
          <button
            type="button"
            onClick={() => !isFirstChapter && goToChapter(chapterIndex - 1)}
            disabled={isFirstChapter}
            className="btn-ghost disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous Chapter
          </button>
          <button
            type="button"
            onClick={() => !isLastChapter && goToChapter(chapterIndex + 1)}
            disabled={isLastChapter}
            className="btn-primary disabled:opacity-40"
          >
            Next Chapter <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {gate.status === "open" && (
          <div className="mt-10 border-t border-current/10 pt-6">
            <CommentSection mangaId={workId} chapterId={currentChapter.id} />
          </div>
        )}
      </main>
    </div>
  );
}
