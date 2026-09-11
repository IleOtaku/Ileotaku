"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import PropellerAdsScript from "@/components/ads/PropellerAdsScript";
import Navbar from "@/components/layout/Navbar";
import { checkAndAwardAchievements } from "@/lib/achievements";
import { useAuth } from "@/hooks/useAuth";
import { markChatRead } from "@/hooks/useChatUnread";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";
import {
  addHistoryEntry,
  getUserProfile,
  updateHistoryReadingTime,
  updateReadingProgress,
  updateUserPrefs,
} from "@/lib/firestore";
import {
  incrementChapterReads,
  incrementSeriesReads,
  listAllCreatorWorks,
  listCreatorMangaWorks,
  listCreatorProseWorksAsList,
  searchAllCreatorWorks,
  searchCreatorMangaWorks,
  searchCreatorProseWorksAsList,
} from "@/lib/publishedSeries";
import { clearReadingActivity, updateReadingActivity } from "@/lib/readingActivity";
import { PLATINUM_READER_THEMES, type ReaderTheme, type ReadingPreferences } from "@/types";
import {
  getChapterPages,
  getMangaDetail,
  proxyImg,
  type MangaDetailResponse,
  type MangaListItem,
} from "@/lib/manga-api";
import CommentSection from "@/components/social/CommentSection";
import ImportedContentGate from "./ImportedContentGate";
import MangaList, { type BrowseTab } from "./MangaList";
import MobileBrowseSheet from "./MobileBrowseSheet";
import MobileTabBar from "./MobileTabBar";
import NextChapterCard from "./NextChapterCard";
import ReaderFab from "./ReaderFab";
import ReaderPages from "./ReaderPages";
import ReaderSidebar, { ChatTab, type ReaderSidebarTab } from "./ReaderSidebar";
import ReaderToolbar from "./ReaderToolbar";

type ReadingMode = "scroll" | "paged";

const DEFAULT_PREFS: ReadingPreferences = {
  mode: "scroll",
  theme: "dark",
  autoload: true,
  showProgressBar: true,
};

/** Main reader client: owns all state, wires the four reader panels together, handles mobile chrome. */
export default function ReaderClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const recordedChapters = useRef<Set<string>>(new Set());
  const trackedReads = useRef<Set<string>>(new Set());
  // Tracks the most recently written history entry's id + when the chapter it belongs to
  // started, so leaving that chapter can back-fill readingTimeMinutes on it. A ref (not state)
  // since it's only ever read inside effect cleanups, never rendered.
  const historyTrackingRef = useRef<{ id: string; startedAt: number } | null>(null);

  const [mangaList, setMangaList] = useState<MangaListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState("All");
  // Which slice of the creator catalog the sidebar/mobile sheet shows — "All Works" mixes
  // formats (a prose result routes straight to /story/[id] on select, see handleSelectManga
  // below); "Manga & Comics" and "Prose Stories" are pre-filtered by format.
  const [browseTab, setBrowseTab] = useState<BrowseTab>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MangaDetailResponse["data"] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [chapterIndex, setChapterIndex] = useState(0);
  const [pages, setPages] = useState<string[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  // Sprint 10 — how far the reader has scrolled into the current chapter (0-100), fed up from
  // ReaderPages; drives the between-chapters ad/auto-advance card once it hits 95%.
  const [pageProgress, setPageProgress] = useState(0);

  const [mode, setMode] = useState<ReadingMode>("scroll");
  const [hdEnabled, setHdEnabled] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [sidebarTab, setSidebarTab] = useState<ReaderSidebarTab>("details");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [initialMobileTab, setInitialMobileTab] = useState<"details" | "chat" | null>(null);
  const [chatReadSignal, setChatReadSignal] = useState(0);
  const [browseSheetOpen, setBrowseSheetOpen] = useState(false);

  const pendingChapterParam = useRef<string | null>(null);
  const initializedFromUrl = useRef(false);

  // ---- Read ?id= / ?chapter= / ?chat= from the URL exactly once, on mount ----
  useEffect(() => {
    if (initializedFromUrl.current) return;
    initializedFromUrl.current = true;

    const idParam = searchParams.get("id");
    const chapterParam = searchParams.get("chapter");
    if (chapterParam) pendingChapterParam.current = chapterParam;
    if (idParam) setSelectedId(idParam);
    // "?chat=1" is how the manga detail page's chat preview links here — jump straight into
    // the mobile Chat tab instead of landing on Details.
    if (searchParams.get("chat")) {
      setInitialMobileTab("chat");
      setMobileSheetOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- List: debounced search, or genre filter when search is empty — source depends on
  // browseTab (all formats / manga only / prose only). ----
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setListLoading(true);
      const query = searchQuery.trim();
      const genre = activeGenre === "All" ? undefined : activeGenre;
      const request = query
        ? browseTab === "prose"
          ? searchCreatorProseWorksAsList(query)
          : browseTab === "manga"
            ? searchCreatorMangaWorks(query)
            : searchAllCreatorWorks(query)
        : browseTab === "prose"
          ? listCreatorProseWorksAsList(genre)
          : browseTab === "manga"
            ? listCreatorMangaWorks(genre)
            : listAllCreatorWorks(genre);

      request
        .then((items) => {
          if (!cancelled) setMangaList(items);
        })
        .catch(() => {
          if (!cancelled) setMangaList([]);
        })
        .finally(() => {
          if (!cancelled) setListLoading(false);
        });
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, activeGenre, browseTab]);

  // ---- Detail: load whenever the selected manga changes ----
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setPages([]);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);

    getMangaDetail(selectedId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res.data);

        const chapters = res.data.chapterList ?? [];
        let initialIndex = chapters.length > 0 ? chapters.length - 1 : 0;
        if (pendingChapterParam.current) {
          const parsed = Number(pendingChapterParam.current);
          if (Number.isInteger(parsed) && parsed >= 0 && parsed < chapters.length) {
            initialIndex = parsed;
          }
          pendingChapterParam.current = null;
        }
        setChapterIndex(initialIndex);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Sync the reader's live theme from the profile's saved preference — re-runs whenever the
  // saved value changes (including this same page's own saves, via handleThemeChange below).
  useEffect(() => {
    if (profile?.preferences?.theme) setTheme(profile.preferences.theme);
  }, [profile?.preferences?.theme]);

  const isPlatinum = profile?.isPlatinum === true;

  async function handleThemeChange(next: ReaderTheme) {
    if (PLATINUM_READER_THEMES.includes(next) && !isPlatinum) return;
    setTheme(next);
    if (!user) return;
    try {
      await updateUserPrefs(user.uid, { preferences: { ...(profile?.preferences ?? DEFAULT_PREFS), theme: next } });
    } catch {
      // Non-fatal — the picked theme still applies for the rest of this session even if the
      // save fails; it just won't have persisted for next time.
    }
  }

  // Reading activity is cleared once, when the reader page itself is left (tab closed,
  // navigated away) — switching chapters/manga while still on the page just overwrites the
  // activity doc via updateReadingActivity below, it doesn't clear it first.
  useEffect(() => {
    return () => {
      if (user) clearReadingActivity(user.uid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const chapters = useMemo(() => detail?.chapterList ?? [], [detail]);
  const currentChapter = chapters[chapterIndex];
  const mangaSource = detail?.source;
  // Every work read through this page is now creator-published — ImportedContentGate (despite
  // the name) still gates it, but only by whatever coin price its own author set per chapter
  // (getLockConfig's "creator" branch), which defaults to free and so renders no gate at all for
  // most chapters.
  const isCreatorSource = mangaSource === "creator";

  // Leaving a chapter (switching chapters, or unmounting) back-fills how long it was open onto
  // its own history entry. A ref, not state, is read here since the effect that WRITES it
  // (the "record a read" effect below) fires and resolves independently of this one.
  useEffect(() => {
    return () => {
      const tracking = historyTrackingRef.current;
      if (!user || !tracking) return;
      const minutes = Math.round((Date.now() - tracking.startedAt) / 60_000);
      if (minutes > 0) updateHistoryReadingTime(user.uid, tracking.id, minutes);
    };
  }, [currentChapter?.id, user]);

  // ---- Record a "read" once a signed-in user's pages have loaded for a chapter they haven't
  // already been credited for this session — powers chaptersRead, history, and achievements.
  useEffect(() => {
    if (!user || !detail || !currentChapter || pagesLoading || pages.length === 0) return;
    const key = `${detail.id ?? selectedId}:${currentChapter.id}`;
    if (recordedChapters.current.has(key)) return;
    recordedChapters.current.add(key);

    const uid = user.uid;
    (async () => {
      try {
        const profile = await getUserProfile(uid);
        const chaptersRead = (profile?.chaptersRead ?? 0) + 1;
        await updateUserPrefs(uid, { chaptersRead });
        const historyId = await addHistoryEntry(uid, {
          mangaId: detail.id ?? selectedId ?? "",
          title: detail.title,
          coverURL: detail.image,
          chapterLabel: currentChapter.chapter,
        });
        historyTrackingRef.current = { id: historyId, startedAt: Date.now() };
        if (profile?.showReadingActivity !== false) {
          updateReadingActivity(
            uid,
            detail.id ?? selectedId ?? "",
            detail.title,
            currentChapter.id,
            currentChapter.chapter,
            detail.image
          );
        }
        await updateReadingProgress(uid, detail.id ?? selectedId ?? "", {
          title: detail.title,
          coverURL: detail.image,
          chapterIndex,
          chapterLabel: currentChapter.chapter,
          totalChapters: chapters.length,
          progress: chapters.length > 0 ? (chapters.length - chapterIndex) / chapters.length : 0,
          updatedAt: new Date().toISOString(),
        });
        if (profile) await checkAndAwardAchievements(uid, { ...profile, chaptersRead });
      } catch {
        // Non-fatal — reading still works even if progress/achievement tracking fails.
      }
    })();
  }, [user, detail, currentChapter, pagesLoading, pages.length, chapterIndex, chapters.length, selectedId]);

  // ---- Pages: load whenever the active chapter changes ----
  useEffect(() => {
    if (!currentChapter) {
      setPages([]);
      return;
    }

    let cancelled = false;
    setPagesLoading(true);

    getChapterPages(currentChapter.id)
      .then((res) => {
        if (!cancelled) setPages(res.data.pages ?? []);
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      })
      .finally(() => {
        if (!cancelled) setPagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentChapter]);

  // ---- Counts this as a read of the series (bumps publishedSeries.totalReads, which feeds
  // Explore's Trending rail and every work card's read count) once its pages have actually
  // loaded. Deduped per chapter per mount the same way the chaptersRead-tracking effect above
  // does, so re-renders (or toggling reading mode) don't inflate the count.
  useEffect(() => {
    if (!isCreatorSource || !detail || !currentChapter || pagesLoading || pages.length === 0) return;
    const key = `${detail.id ?? selectedId}:${currentChapter.id}`;
    if (trackedReads.current.has(key)) return;
    trackedReads.current.add(key);
    incrementSeriesReads(detail.id ?? selectedId ?? "");
    // currentChapter.id here is the "creator:{workId}:{chapterDocId}" composite id
    // getPublishedSeriesDetail() encodes chapters with — parse the real chapter doc id back out
    // so Manage Chapters' per-chapter read count includes reads from this (manga/manhwa/manhua)
    // reader too, not just the prose one.
    if (currentChapter.id.startsWith("creator:")) {
      const [, workId, chapterDocId] = currentChapter.id.split(":");
      if (workId && chapterDocId) incrementChapterReads(workId, chapterDocId);
    }
  }, [isCreatorSource, detail, currentChapter, pagesLoading, pages.length, selectedId]);

  const handleSelectManga = useCallback(
    (id: string) => {
      // A prose result (only reachable from the "All Works" tab, since "Prose Stories" is its
      // own tab too) has no image-page reading pane here — send it to its own reader instead of
      // loading it into this one.
      const picked = mangaList.find((m) => m.id === id);
      if (picked?.format?.toLowerCase() === "prose") {
        router.push(`/story/${encodeURIComponent(id)}`);
        return;
      }
      setSelectedId(id);
      setSidebarTab("details");
      setMobileSheetOpen(false);
      setBrowseSheetOpen(false);
      router.replace(`/reader?id=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router, mangaList]
  );

  const isFirstChapter = chapters.length === 0 || chapterIndex === chapters.length - 1;
  const isLastChapter = chapters.length === 0 || chapterIndex === 0;

  function handlePrevChapter() {
    if (!isFirstChapter) setChapterIndex((i) => Math.min(i + 1, chapters.length - 1));
  }
  function handleNextChapter() {
    if (!isLastChapter) setChapterIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Required for AdSlot's between-chapters banner (NextChapterCard) to actually render an
       * ad into its data-zone-id div — loaded here, not the root layout, so it never runs on any
       * page but the reader. */}
      <PropellerAdsScript />
      <Navbar />
      <div className="flex min-h-0 flex-1">
        <MangaList
          items={mangaList}
          loading={listLoading}
          selectedId={selectedId}
          onSelect={handleSelectManga}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeGenre={activeGenre}
          onGenreChange={setActiveGenre}
          browseTab={browseTab}
          onBrowseTabChange={setBrowseTab}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ReaderToolbar
            title={detail?.title ?? "ÍléOtaku Reader"}
            mangaId={detail?.id ?? selectedId}
            chapterLabel={currentChapter?.chapter ?? ""}
            chapters={chapters}
            chapterIndex={chapterIndex}
            onChapterIndexChange={setChapterIndex}
            onPrev={handlePrevChapter}
            onNext={handleNextChapter}
            canPrev={!isFirstChapter}
            canNext={!isLastChapter}
            mode={mode}
            onModeChange={setMode}
            hdEnabled={hdEnabled}
            onToggleHd={() => setHdEnabled((v) => !v)}
            onOpenDetails={() => setMobileSheetOpen(true)}
            chatReadSignal={chatReadSignal}
            coverURL={detail?.image ?? ""}
            pages={pages}
            theme={theme}
            onThemeChange={handleThemeChange}
            isPlatinum={isPlatinum}
          />

          <div className="relative flex min-h-0 flex-1 flex-col">
          {isCreatorSource && detail && currentChapter && !detailLoading && !pagesLoading ? (
            <ImportedContentGate
              mangaId={detail.id ?? selectedId ?? ""}
              chapterId={currentChapter.id}
              chapterIndex={chapterIndex}
              source={mangaSource}
              creatorChapterCoinPrice={isCreatorSource ? currentChapter.coinPrice : undefined}
              userProfile={profile}
              mangaTitle={detail.title}
              chapterLabel={currentChapter.chapter}
              firstPageUrl={pages[0]}
            >
              <ReaderPages
                detail={detail}
                detailLoading={detailLoading}
                pages={pages}
                pagesLoading={pagesLoading}
                mode={mode}
                chapterKey={currentChapter?.id ?? "none"}
                hdEnabled={hdEnabled}
                theme={theme}
                onProgressChange={setPageProgress}
              />
            </ImportedContentGate>
          ) : (
            <ReaderPages
              detail={detail}
              detailLoading={detailLoading}
              pages={pages}
              pagesLoading={pagesLoading}
              mode={mode}
              theme={theme}
              chapterKey={currentChapter?.id ?? "none"}
              hdEnabled={hdEnabled}
              onProgressChange={setPageProgress}
            />
          )}

          {pageProgress >= 95 && !isLastChapter && currentChapter && !detailLoading && !pagesLoading && (
            <NextChapterCard onNext={handleNextChapter} />
          )}
          </div>
        </div>

        <ReaderSidebar
          detail={detail}
          detailLoading={detailLoading}
          chapters={chapters}
          chapterIndex={chapterIndex}
          onSelectChapter={setChapterIndex}
          mangaId={selectedId}
          mangaTitle={detail?.title ?? ""}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
        />
      </div>

      <ReaderFab />

      <MobileBrowseSheet
        open={browseSheetOpen}
        onClose={() => setBrowseSheetOpen(false)}
        items={mangaList}
        loading={listLoading}
        selectedId={selectedId}
        onSelect={handleSelectManga}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeGenre={activeGenre}
        onGenreChange={setActiveGenre}
        browseTab={browseTab}
        onBrowseTabChange={setBrowseTab}
      />

      <MobileTabBar
        browseOpen={browseSheetOpen}
        onToggleBrowse={() => setBrowseSheetOpen((o) => !o)}
      />

      <MobileDetailsSheet
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        detail={detail}
        mangaId={selectedId}
        chapters={chapters}
        chapterIndex={chapterIndex}
        onSelectChapter={(i) => {
          setChapterIndex(i);
          setMobileSheetOpen(false);
        }}
        initialTab={initialMobileTab}
        onInitialTabConsumed={() => setInitialMobileTab(null)}
        onChatOpened={() => {
          if (selectedId) markChatRead(selectedId);
          setChatReadSignal((n) => n + 1);
        }}
      />
    </div>
  );
}

/* ---------------------------- Mobile details bottom sheet ---------------------------- */

type DetailsSheetTab = "details" | "chapters" | "comments" | "chat";

const DETAILS_SHEET_TABS: { key: DetailsSheetTab; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "chapters", label: "Chapters" },
  { key: "comments", label: "Comments" },
  { key: "chat", label: "Chat" },
];

function MobileDetailsSheet({
  open,
  onClose,
  detail,
  mangaId,
  chapters,
  chapterIndex,
  onSelectChapter,
  initialTab,
  onInitialTabConsumed,
  onChatOpened,
}: {
  open: boolean;
  onClose: () => void;
  detail: MangaDetailResponse["data"] | null;
  mangaId: string | null;
  chapters: { id: string; chapter: string }[];
  chapterIndex: number;
  onSelectChapter: (idx: number) => void;
  /** One-shot override for which tab to land on the next time the sheet opens (e.g. a "Join
   * the conversation" link from the manga detail page wants to open straight into Chat). */
  initialTab: "details" | "chat" | null;
  onInitialTabConsumed: () => void;
  /** Fired whenever the Chat tab becomes the active tab, so ReaderClient can mark the room
   * read (clearing the unread dot on ReaderToolbar's info button). */
  onChatOpened: () => void;
}) {
  const [tab, setTab] = useState<DetailsSheetTab>("details");
  const vvHeight = useVisualViewportHeight();

  // Land back on Details each time the sheet is reopened (unless a one-shot initialTab says
  // otherwise), rather than remembering whatever tab was last active.
  useEffect(() => {
    if (open) {
      setTab(initialTab ?? "details");
      if (initialTab) onInitialTabConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (tab === "chat") onChatOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end bg-black/70 md:hidden"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full flex-col overflow-hidden rounded-t-2xl border-t border-bg4 bg-bg2"
            style={{ height: vvHeight ? Math.min(vvHeight * 0.85, vvHeight - 24) : "80vh" }}
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-bg4" />

            <div className="flex shrink-0 gap-1 px-4 pb-2 pt-3">
              {DETAILS_SHEET_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`min-h-[44px] flex-1 rounded-lg font-syne text-xs font-semibold transition-colors ${
                    tab === t.key ? "bg-clay text-ivory" : "bg-bg3 text-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "details" && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-2">
                {detail && (
                  <div className="mb-4 flex gap-3">
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-bg3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
            loading="lazy"
                        src={proxyImg(detail.image)}
                        alt={detail.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-syne text-sm font-semibold text-text">
                        {detail.title}
                      </h3>
                      {detail.status && (
                        <span className="mt-1 inline-block rounded-full bg-green/15 px-2 py-0.5 font-noto text-[10px] text-green2">
                          {detail.status}
                        </span>
                      )}
                      {detail.author && (
                        <p className="mt-1 font-noto text-xs text-muted">by {detail.author}</p>
                      )}
                    </div>
                  </div>
                )}
                {detail?.description && (
                  <p className="font-noto text-sm leading-relaxed text-muted">{detail.description}</p>
                )}
              </div>
            )}

            {tab === "chapters" && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-2">
                <div className="flex flex-col gap-1">
                  {chapters.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectChapter(i)}
                      className={`min-h-[44px] rounded-lg px-3 py-2 text-left font-noto text-xs transition-colors ${
                        i === chapterIndex ? "bg-clay/20 text-clay2" : "text-text hover:bg-bg3"
                      }`}
                    >
                      {c.chapter}
                    </button>
                  ))}
                  {chapters.length === 0 && (
                    <p className="px-3 py-2 font-noto text-xs text-muted">No chapters yet.</p>
                  )}
                </div>
              </div>
            )}

            {tab === "comments" && (
              <div className="min-h-0 flex-1">
                {mangaId ? (
                  <CommentSection mangaId={mangaId} variant="sheet" />
                ) : (
                  <p className="p-4 text-center font-noto text-sm text-muted">
                    Comments aren&apos;t available for this series.
                  </p>
                )}
              </div>
            )}

            {tab === "chat" && (
              <div className="min-h-0 flex-1">
                {mangaId ? (
                  <ChatTab mangaId={mangaId} mangaTitle={detail?.title ?? ""} />
                ) : (
                  <p className="p-4 text-center font-noto text-sm text-muted">
                    Chat isn&apos;t available for this series.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
