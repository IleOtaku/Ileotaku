import { getHistory } from "./firestore";
import type { UserProfile } from "@/types";

export type ReadingStatsRange = "week" | "month" | "all";

export interface ReadingStats {
  /** Total minutes read within the selected range, summed from HistoryEntry.readingTimeMinutes.
   * Entries from before that field existed (pre-Sprint 9e) simply contribute 0 — see the
   * `trackedMinutesEntryCount` note below for why this is surfaced honestly rather than hidden. */
  totalMinutes: number;
  averageChaptersPerDay: number;
  /** Longest single HistoryEntry.readingTimeMinutes value in range — the closest honest proxy
   * for "session length" this data model supports, since chapters aren't grouped into sessions
   * anywhere. Undefined when no entry in range has a tracked reading time. */
  longestSessionMinutes: number | undefined;
  favoriteGenre: string | undefined;
  mostReadSeries: { title: string; count: number } | undefined;
  /** Longest run of consecutive days in profile.streakDays — always all-time (a "record" isn't
   * meaningful scoped to a week/month window), independent of the selected range. */
  streakRecord: number;
  chaptersThisMonth: number;
  chaptersLastMonth: number;
  /** How many of the in-range history entries actually have a tracked reading time — lets the
   * UI show "not enough data yet" instead of a misleadingly precise 0 when e.g. every chapter in
   * range predates readingTimeMinutes being tracked. */
  trackedMinutesEntryCount: number;
  /** Total history entries considered for this range. */
  entryCount: number;
}

function startOfRange(range: ReadingStatsRange): Date | null {
  const now = new Date();
  if (range === "week") return new Date(now.getTime() - 7 * 86_400_000);
  if (range === "month") return new Date(now.getTime() - 30 * 86_400_000);
  return null;
}

/** Longest run of consecutive calendar days within a set of "YYYY-MM-DD" date strings — the
 * "record" half of the reading streak (profile.streakDays only tracks the running CURRENT
 * streak length elsewhere in the app; this derives the best-ever run from the same raw dates). */
function longestConsecutiveRun(days: string[]): number {
  if (days.length === 0) return 0;
  const sorted = Array.from(new Set(days)).sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const dayDiff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    current = dayDiff === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

/**
 * Reading Stats dashboard data (Sprint 9e, Platinum-exclusive) — computed honestly from real
 * history entries rather than fabricated. Reading speed (pages/min) is deliberately NOT included
 * here: nothing in this codebase tracks per-chapter page counts against time spent, so there's no
 * real number to compute — ReadingStatsCard shows "Not enough data yet" for it instead of
 * inventing a figure.
 */
export async function getReadingStats(
  uid: string,
  profile: Pick<UserProfile, "favoriteGenre" | "streakDays"> | null,
  range: ReadingStatsRange
): Promise<ReadingStats> {
  // Capped, not paginated — a dashboard stat computation, same tradeoff getAllPostsForAdmin makes.
  const history = await getHistory(uid, 1000);
  const cutoff = startOfRange(range);
  const inRange = cutoff ? history.filter((h) => new Date(h.readAt) >= cutoff) : history;

  const trackedMinutes = inRange
    .map((h) => h.readingTimeMinutes)
    .filter((m): m is number => typeof m === "number" && m > 0);
  const totalMinutes = trackedMinutes.reduce((sum, m) => sum + m, 0);

  const daySet = new Set(inRange.map((h) => h.readAt.slice(0, 10)));
  const daysSpanned = cutoff
    ? Math.max(1, Math.round((Date.now() - cutoff.getTime()) / 86_400_000))
    : Math.max(1, daySet.size);
  const averageChaptersPerDay = inRange.length / daysSpanned;

  const seriesCounts = new Map<string, { title: string; count: number }>();
  for (const h of inRange) {
    const existing = seriesCounts.get(h.mangaId);
    if (existing) existing.count += 1;
    else seriesCounts.set(h.mangaId, { title: h.title, count: 1 });
  }
  const mostReadSeries = Array.from(seriesCounts.values()).sort((a, b) => b.count - a.count)[0];

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const chaptersThisMonth = history.filter((h) => h.readAt.slice(0, 7) === thisMonthKey).length;
  const chaptersLastMonth = history.filter((h) => h.readAt.slice(0, 7) === lastMonthKey).length;

  return {
    totalMinutes,
    averageChaptersPerDay,
    longestSessionMinutes: trackedMinutes.length > 0 ? Math.max(...trackedMinutes) : undefined,
    favoriteGenre: profile?.favoriteGenre,
    mostReadSeries,
    streakRecord: longestConsecutiveRun(profile?.streakDays ?? []),
    chaptersThisMonth,
    chaptersLastMonth,
    trackedMinutesEntryCount: trackedMinutes.length,
    entryCount: inRange.length,
  };
}
