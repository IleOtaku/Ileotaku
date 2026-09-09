"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, BookOpen, Clock, Flame, Gauge, Lock, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { getReadingStats, type ReadingStats, type ReadingStatsRange } from "@/lib/readingStats";
import type { UserProfile } from "@/types";

export interface ReadingStatsCardProps {
  uid: string;
  profile: UserProfile | null;
}

const RANGES: { label: string; value: ReadingStatsRange }[] = [
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "All Time", value: "all" },
];

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-plat/25 bg-gradient-to-br from-plat/10 to-gold/5 p-3.5">
      <div className="flex items-center gap-1.5 font-noto text-[11px] text-muted">
        {icon} {label}
      </div>
      <p className="mt-1 font-cinzel text-lg text-plat2">{value}</p>
    </div>
  );
}

/** Platinum-exclusive reading stats dashboard card — every number here is computed from real
 * history entries (see lib/readingStats.ts), not fabricated. "Reading speed" has no underlying
 * data source anywhere in this codebase (no per-chapter page-count-vs-time tracking exists), so
 * it's deliberately omitted from the tile grid rather than shown with an invented number. */
export default function ReadingStatsCard({ uid, profile }: ReadingStatsCardProps) {
  const [range, setRange] = useState<ReadingStatsRange>("month");
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const isPlatinum = profile?.isPlatinum === true;

  useEffect(() => {
    if (!isPlatinum) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getReadingStats(uid, profile, range)
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, profile, range, isPlatinum]);

  if (!isPlatinum) {
    return (
      <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted" />
          <h3 className="font-syne text-sm font-semibold text-text">Reading Stats</h3>
          <Lock className="ml-auto h-3.5 w-3.5 text-muted" />
        </div>
        <p className="font-noto text-xs text-muted">
          Detailed reading stats — total time, favourite genre, streak record, and more — are a
          Platinum feature.
        </p>
        <Link href="/pricing" className="btn-plat mt-3 w-full justify-center text-sm">
          <Sparkles className="h-3.5 w-3.5" /> Unlock Reading Stats
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-plat/30 bg-plat/5 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-plat2" />
          <h3 className="font-syne text-sm font-semibold text-text">Reading Stats</h3>
        </div>
        <div className="flex gap-1 rounded-full border border-muted2 bg-bg3 p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`rounded-full px-3 py-1 font-noto text-[11px] font-semibold transition-colors ${
                range === r.value ? "bg-plat text-bg" : "text-muted hover:text-text"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            icon={<Clock className="h-3 w-3" />}
            label="Total Reading Time"
            value={
              stats.trackedMinutesEntryCount === 0
                ? "Not enough data yet"
                : `${(stats.totalMinutes / 60).toFixed(1)}h`
            }
          />
          <StatTile
            icon={<TrendingUp className="h-3 w-3" />}
            label="Avg Chapters/Day"
            value={stats.averageChaptersPerDay.toFixed(1)}
          />
          <StatTile
            icon={<Clock className="h-3 w-3" />}
            label="Longest Session"
            value={stats.longestSessionMinutes !== undefined ? `${stats.longestSessionMinutes}m` : "Not enough data yet"}
          />
          <StatTile
            icon={<BookOpen className="h-3 w-3" />}
            label="Favourite Genre"
            value={stats.favoriteGenre ?? "Not set"}
          />
          <StatTile
            icon={<Trophy className="h-3 w-3" />}
            label="Most Read Series"
            value={stats.mostReadSeries ? stats.mostReadSeries.title : "Not enough data yet"}
          />
          <StatTile
            icon={<Flame className="h-3 w-3" />}
            label="Streak Record"
            value={`${stats.streakRecord} day${stats.streakRecord === 1 ? "" : "s"}`}
          />
          <StatTile
            icon={<BarChart3 className="h-3 w-3" />}
            label="This Month vs Last"
            value={`${stats.chaptersThisMonth} / ${stats.chaptersLastMonth}`}
          />
          <StatTile
            icon={<Gauge className="h-3 w-3" />}
            label="Reading Speed"
            value="Not enough data yet"
          />
        </div>
      )}
    </div>
  );
}
