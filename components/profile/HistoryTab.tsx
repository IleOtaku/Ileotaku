"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AlertTriangle, Clock, Loader2, Trash2, X } from "lucide-react";
import { EmptyState, Modal, Select, Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import {
  clearAllHistory,
  clearHistoryOlderThan,
  deleteHistoryItem,
  getHistory,
} from "@/lib/firestore";
import { proxyImg } from "@/lib/manga-api";
import { formatTime } from "@/lib/utils";
import type { HistoryEntry } from "@/types";

type OlderThanOption = "1w" | "1m" | "3m" | "all";

const OLDER_THAN_OPTIONS: { label: string; value: OlderThanOption }[] = [
  { label: "Clear history older than...", value: "1w" },
  { label: "Older than 1 week", value: "1w" },
  { label: "Older than 1 month", value: "1m" },
  { label: "Older than 3 months", value: "3m" },
  { label: "All time", value: "all" },
];
const OLDER_THAN_DAYS: Record<Exclude<OlderThanOption, "all">, number> = { "1w": 7, "1m": 30, "3m": 90 };

type DateGroup = "Today" | "Yesterday" | "This Week" | "Earlier";

function groupFor(readAt: string): DateGroup {
  const read = new Date(readAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 86_400_000);
  if (read >= startOfToday) return "Today";
  if (read >= startOfYesterday) return "Yesterday";
  if (read >= startOfWeek) return "This Week";
  return "Earlier";
}
const GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "This Week", "Earlier"];

interface HistoryItemProps {
  entry: HistoryEntry;
  deleting: boolean;
  onDelete: () => void;
}

/** One row in the reading history list — memoized since the list can hold up to 200 entries and
 * only the row being deleted ever actually changes on a given interaction. */
const HistoryItem = memo(function HistoryItem({ entry, deleting, onDelete }: HistoryItemProps) {
  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-bg4 bg-bg2 p-3 transition-colors hover:border-clay">
      <Link
        href={`/manga/${encodeURIComponent(entry.mangaId)}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-bg3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyImg(entry.coverURL)}
            alt={entry.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-syne text-sm font-semibold text-text">{entry.title}</p>
          <p className="font-noto text-xs text-muted">{entry.chapterLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-noto text-[11px] text-muted">
            <span>{new Date(entry.readAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
            {entry.readingTimeMinutes !== undefined && entry.readingTimeMinutes > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {entry.readingTimeMinutes} min
              </span>
            )}
          </div>
        </div>
      </Link>
      <span className="hidden shrink-0 font-noto text-[11px] text-muted sm:inline">
        {formatTime(entry.readAt)}
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Remove this history entry"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:bg-clay/15 hover:text-clay2 focus-visible:opacity-100 group-hover:opacity-100 sm:opacity-0"
      >
        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
});

/** Recently-read chapters, grouped by date, read live from the user's Firestore history
 * subcollection — with per-item delete, clear-all, and clear-older-than controls. */
export default function HistoryTab() {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingOlderThan, setClearingOlderThan] = useState(false);

  function load() {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getHistory(user.uid, 200)
      .then(setHistory)
      .finally(() => setLoading(false));
  }

  useEffect(load, [user]);

  const grouped = useMemo(() => {
    const map = new Map<DateGroup, HistoryEntry[]>();
    for (const entry of history) {
      const g = groupFor(entry.readAt);
      const arr = map.get(g) ?? [];
      arr.push(entry);
      map.set(g, arr);
    }
    return GROUP_ORDER.map((g) => [g, map.get(g) ?? []] as const).filter(([, items]) => items.length > 0);
  }, [history]);

  async function handleClearAll() {
    if (!user) return;
    setClearingAll(true);
    try {
      await clearAllHistory(user.uid);
      setHistory([]);
      setClearAllOpen(false);
      toast.success("History cleared.");
    } catch {
      toast.error("Couldn't clear your history. Please try again.");
    } finally {
      setClearingAll(false);
    }
  }

  async function handleDeleteOne(itemId: string) {
    if (!user) return;
    setDeletingId(itemId);
    const previous = history;
    setHistory((h) => h.filter((e) => e.id !== itemId));
    try {
      await deleteHistoryItem(user.uid, itemId);
    } catch {
      setHistory(previous);
      toast.error("Couldn't delete that entry.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearOlderThan(value: string) {
    if (!user || value === "") return;
    const option = value as OlderThanOption;
    setClearingOlderThan(true);
    try {
      if (option === "all") {
        await clearAllHistory(user.uid);
        setHistory([]);
      } else {
        await clearHistoryOlderThan(user.uid, OLDER_THAN_DAYS[option]);
        const cutoff = new Date(Date.now() - OLDER_THAN_DAYS[option] * 86_400_000).toISOString();
        setHistory((h) => h.filter((e) => e.readAt >= cutoff));
      }
      toast.success("History cleared.");
    } catch {
      toast.error("Couldn't clear your history. Please try again.");
    } finally {
      setClearingOlderThan(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-syne text-sm font-semibold text-text">Reading History</h3>
        {history.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value=""
              onChange={(e) => handleClearOlderThan(e.target.value)}
              disabled={clearingOlderThan}
              options={OLDER_THAN_OPTIONS}
              className="w-auto text-xs"
            />
            <button
              type="button"
              onClick={() => setClearAllOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-clay/50 px-3 py-1.5 font-noto text-xs font-semibold text-clay2 transition-colors hover:bg-clay/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear All History
            </button>
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={<span className="text-4xl">🕐</span>}
          title="No History Yet"
          description="Chapters you read will appear here."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([group, items]) => (
            <div key={group}>
              <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                {group}
              </p>
              <div className="flex flex-col gap-2">
                {items.map((entry) => (
                  <HistoryItem
                    key={entry.id}
                    entry={entry}
                    deleting={deletingId === entry.id}
                    onDelete={() => handleDeleteOne(entry.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={clearAllOpen} onClose={() => setClearAllOpen(false)} title="Clear all history?">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg border border-clay/30 bg-clay/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clay2" />
            <p className="font-noto text-sm text-text">
              This permanently removes all your reading history. Your progress on series is kept,
              only the history log is cleared.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setClearAllOpen(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearingAll}
              className="inline-flex items-center gap-2 rounded-full bg-clay px-5 py-2.5 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-clay2 disabled:opacity-50"
            >
              {clearingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Clear History
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
