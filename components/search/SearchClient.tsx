"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Search, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getBlockedUsers } from "@/lib/blocking";
import { getPopularCreators, searchUsers } from "@/lib/firestore";
import { searchPublishedWorks } from "@/lib/publishedSeries";
import { parseViewCount } from "@/lib/utils";
import type { PublishedSeries, UserProfile } from "@/types";
import FilterSidebar from "./FilterSidebar";
import PersonCard from "./PersonCard";
import ResultCard from "./ResultCard";
import { DEFAULT_FILTERS, type SearchFilters, type SearchResultItem, type WorksFormatFilter } from "./types";

const RECENT_KEY = "ileotaku-recent-searches";
const RECENT_LIMIT = 8;
const POPULAR_SEARCHES = ["Action", "Romance", "African", "Fantasy", "Adventure"];

type ResultTab = "manga" | "people";
type PeopleFilter = "all" | "creators" | "publishers" | "verified";

const PEOPLE_FILTERS: { label: string; value: PeopleFilter }[] = [
  { label: "All", value: "all" },
  { label: "Creators Only", value: "creators" },
  { label: "Publishers Only", value: "publishers" },
  { label: "Verified Only", value: "verified" },
];

const WORKS_FORMAT_FILTERS: { label: string; value: WorksFormatFilter }[] = [
  { label: "All", value: "all" },
  { label: "Manga", value: "manga" },
  { label: "Prose", value: "prose" },
];

function applyPeopleFilter(people: UserProfile[], filter: PeopleFilter): UserProfile[] {
  switch (filter) {
    case "creators":
      return people.filter((p) => p.isCreator === true);
    case "publishers":
      return people.filter((p) => p.isPublisher === true);
    case "verified":
      return people.filter((p) => p.isVerified === true || p.verified === true);
    default:
      return people;
  }
}

function toResultItem(series: PublishedSeries): SearchResultItem {
  return {
    id: series.id,
    title: series.title,
    image: series.coverImage,
    author: series.authorName,
    authorVerified: series.authorVerified === true,
    genres: series.genres,
    format: series.format,
    reads: series.totalReads ?? 0,
    chapters: series.chapterCount ?? 0,
    rating: series.averageRating ?? 0,
  };
}

async function runSearch(
  query: string,
  filters: SearchFilters,
  worksFormat: WorksFormatFilter
): Promise<SearchResultItem[]> {
  const format = worksFormat === "all" ? undefined : worksFormat;
  const series = await searchPublishedWorks(query, format);
  let items = series.map(toResultItem);

  if (filters.genres.length > 0) {
    items = items.filter((i) => i.genres.some((g) => filters.genres.includes(g)));
  }

  if (filters.sort === "highest-rated") {
    items = [...items].sort((a, b) => b.rating - a.rating);
  } else if (filters.sort === "newest") {
    // searchPublishedWorks already reads from a newest-first query — leave order as-is.
  } else {
    items = [...items].sort((a, b) => parseViewCount(String(b.reads)) - parseViewCount(String(a.reads)));
  }

  return items;
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string): string[] {
  try {
    const current = loadRecent().filter((q) => q.toLowerCase() !== query.toLowerCase());
    const updated = [query, ...current].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return loadRecent();
  }
}

function removeRecent(query: string): string[] {
  try {
    const updated = loadRecent().filter((q) => q !== query);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return loadRecent();
  }
}

function clearAllRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Best-effort — nothing further to do if localStorage is unavailable.
  }
}

/** Full search experience: auto-focused search bar, filter sidebar, grid/list results. */
export default function SearchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setBlockedUids(new Set());
      return;
    }
    getBlockedUsers(user.uid).then((uids) => setBlockedUids(new Set(uids)));
  }, [user]);

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<SearchFilters>(() => {
    const sortParam = searchParams.get("sort") as SearchFilters["sort"] | null;
    const validSorts: SearchFilters["sort"][] = [
      "most-read",
      "newest",
      "highest-rated",
      "most-bookmarked",
    ];
    return {
      ...DEFAULT_FILTERS,
      sort: sortParam && validSorts.includes(sortParam) ? sortParam : DEFAULT_FILTERS.sort,
    };
  });
  const [worksFormat, setWorksFormat] = useState<WorksFormatFilter>(() => {
    const param = searchParams.get("format");
    return param === "manga" || param === "prose" ? param : "all";
  });
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [tab, setTab] = useState<ResultTab>(() => {
    const tabParam = searchParams.get("tab");
    return tabParam === "people" || (searchParams.get("q") ?? "").startsWith("@") ? "people" : "manga";
  });
  const [peopleResults, setPeopleResults] = useState<UserProfile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("all");
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    setRecentSearches(loadRecent());
    getPopularCreators(6)
      .then(setSuggestedUsers)
      .catch(() => setSuggestedUsers([]));
  }, []);

  // Typing "@" anywhere in the query jumps to the People tab automatically.
  useEffect(() => {
    if (query.trim().startsWith("@")) setTab("people");
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      runSearch(query, filters, worksFormat)
        .then((items) => {
          if (cancelled) return;
          setResults(items);
          setHasSearched(true);
          if (query.trim()) {
            setRecentSearches(saveRecent(query.trim()));
          }
          const params = new URLSearchParams();
          if (query.trim()) params.set("q", query.trim());
          if (tab === "people") params.set("tab", "people");
          if (worksFormat !== "all") params.set("format", worksFormat);
          router.replace(`/search${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters, worksFormat]);

  useEffect(() => {
    const trimmed = query.trim().replace(/^@/, "");
    if (!trimmed) {
      setPeopleResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setPeopleLoading(true);
      searchUsers(trimmed)
        .then((users) => {
          if (!cancelled) setPeopleResults(users);
        })
        .catch(() => {
          if (!cancelled) setPeopleResults([]);
        })
        .finally(() => {
          if (!cancelled) setPeopleLoading(false);
        });
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function handlePopularClick(term: string) {
    setQuery(term);
  }

  function removeSearch(term: string) {
    setRecentSearches(removeRecent(term));
  }

  function clearAllSearches() {
    clearAllRecent();
    setRecentSearches([]);
  }

  const filteredPeople = applyPeopleFilter(
    peopleResults.filter((p) => !blockedUids.has(p.uid)),
    peopleFilter
  );
  const visibleSuggestedUsers = suggestedUsers.filter((p) => !blockedUids.has(p.uid));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, authors, genres, or @creator..."
            className="input-base py-3.5 pl-12 text-base"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-text"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-4 flex justify-center gap-1 rounded-full border border-muted2 bg-bg3 p-1">
          <button
            type="button"
            onClick={() => setTab("manga")}
            className={`flex-1 rounded-full px-4 py-1.5 font-syne text-sm font-semibold transition-colors ${
              tab === "manga" ? "bg-clay text-ivory" : "text-muted hover:text-text"
            }`}
          >
            Works
          </button>
          <button
            type="button"
            onClick={() => setTab("people")}
            className={`flex-1 rounded-full px-4 py-1.5 font-syne text-sm font-semibold transition-colors ${
              tab === "people" ? "bg-clay text-ivory" : "text-muted hover:text-text"
            }`}
          >
            <UsersRound className="mr-1.5 inline h-3.5 w-3.5" /> People
          </button>
        </div>

        {tab === "manga" && !query && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="font-noto text-xs text-muted">Recent</span>
              {recentSearches.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllSearches}
                  className="font-noto text-xs text-red-400/70 transition-colors hover:text-red-400"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {recentSearches.length === 0 ? (
                <span className="font-noto text-xs text-muted">No recent searches</span>
              ) : (
                recentSearches.map((term) => (
                  <div
                    key={term}
                    onClick={() => handlePopularClick(term)}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.07] bg-bg3 px-3 py-1.5 hover:border-clay/30"
                  >
                    <span className="font-noto text-xs text-text">{term}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSearch(term);
                      }}
                      aria-label={`Remove "${term}" from recent searches`}
                      className="ml-1 leading-none text-muted/40 transition-colors hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="font-noto text-xs text-muted">Popular:</span>
              {POPULAR_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => handlePopularClick(term)}
                  className="rounded-full border border-muted2 bg-bg3 px-3 py-1 font-noto text-xs text-text hover:border-clay"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab === "manga" && (
        <div className="mt-6 flex justify-center gap-2">
          {WORKS_FORMAT_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setWorksFormat(f.value)}
              className={`rounded-full border px-4 py-1.5 font-noto text-sm transition-colors ${
                worksFormat === f.value ? "border-clay bg-clay text-ivory" : "border-muted2 bg-bg3 text-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {tab === "manga" && (
      <div className="mt-6 flex items-center justify-between lg:hidden">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="btn-ghost text-sm"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </div>
      )}

      {tab === "manga" && (
      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <FilterSidebar filters={filters} onChange={setFilters} />
        </aside>

        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-[100] flex items-end bg-black/70 lg:hidden" onClick={() => setMobileFiltersOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[80vh] w-full flex-col rounded-t-2xl border-t border-bg4 bg-bg2"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-bg4 p-5 pb-4">
                <span className="font-cinzel text-lg text-gold">Filters</span>
                <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close">
                  <X className="h-5 w-5 text-muted" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4">
                <FilterSidebar filters={filters} onChange={setFilters} />
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="mb-5 flex items-center justify-between">
            <p className="font-noto text-sm text-muted">
              {loading
                ? "Searching..."
                : query
                  ? `${results.length} results for "${query}"`
                  : `${results.length} works`}
            </p>
            <div className="flex items-center gap-1 rounded-full border border-muted2 bg-bg3 p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  viewMode === "grid" ? "bg-clay text-ivory" : "text-muted"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  viewMode === "list" ? "bg-clay text-ivory" : "text-muted"
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {loading ? (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
                  : "flex flex-col gap-3"
              }
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className={viewMode === "grid" ? "aspect-[3/4] rounded-xl" : "h-28 w-full rounded-xl"}
                />
              ))}
            </div>
          ) : results.length === 0 && hasSearched ? (
            <EmptyState
              icon={<span className="text-4xl">🔍</span>}
              title="No Results Found"
              description="Try different keywords or filters, or be the first creator to publish one."
            />
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
                  : "flex flex-col gap-3"
              }
            >
              {results.map((item) => (
                <ResultCard key={item.id} item={item} view={viewMode} />
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {tab === "people" && (
        <div className="mt-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-noto text-sm text-muted">
              {peopleLoading
                ? "Searching..."
                : query.trim()
                  ? `${filteredPeople.length} people for "${query.trim().replace(/^@/, "")}"`
                  : "Suggested creators"}
            </p>
            <div className="flex flex-wrap gap-2">
              {PEOPLE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setPeopleFilter(f.value)}
                  className={`rounded-full border px-3 py-1.5 font-noto text-xs transition-colors ${
                    peopleFilter === f.value
                      ? "border-clay bg-clay text-ivory"
                      : "border-muted2 bg-bg3 text-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {!query.trim() ? (
            visibleSuggestedUsers.length === 0 ? (
              <EmptyState
                icon={<UsersRound className="h-8 w-8 text-muted" />}
                title="No suggested creators yet"
                description="Follow a few creators and they'll start showing up here for others."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {applyPeopleFilter(visibleSuggestedUsers, peopleFilter).map((p) => (
                  <PersonCard key={p.uid} person={p} />
                ))}
              </div>
            )
          ) : peopleLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-2xl" />
              ))}
            </div>
          ) : filteredPeople.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="h-8 w-8 text-muted" />}
              title={`No users found for "${query.trim().replace(/^@/, "")}"`}
              description="Double-check the spelling, or try just their first name."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPeople.map((p) => (
                <PersonCard key={p.uid} person={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
