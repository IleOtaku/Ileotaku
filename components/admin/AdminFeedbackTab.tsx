"use client";

import { useEffect, useState } from "react";
import { Bug, Lightbulb, ThumbsUp, type LucideIcon } from "lucide-react";
import { getFeedback, markFeedbackResolved } from "@/lib/admin";
import { formatTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import type { BetaFeedbackEntry, BetaFeedbackType } from "@/types";

type FilterValue = "all" | BetaFeedbackType | "unresolved";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Bugs", value: "bug" },
  { label: "Suggestions", value: "suggestion" },
  { label: "Compliments", value: "compliment" },
  { label: "Unresolved", value: "unresolved" },
];

const TYPE_BADGE: Record<BetaFeedbackType, string> = {
  bug: "bg-red-500/15 text-red-400",
  suggestion: "bg-gold/15 text-gold2",
  compliment: "bg-green/15 text-green2",
};

// Beta feedback UI/UX: "Everywhere that emoji were used instead of icons should be changed to
// icons" — this table's type badges were structural chrome, in scope for the icon swap.
const TYPE_LABEL: Record<BetaFeedbackType, string> = {
  bug: "Bug",
  suggestion: "Suggestion",
  compliment: "Compliment",
};

const TYPE_ICON: Record<BetaFeedbackType, LucideIcon> = {
  bug: Bug,
  suggestion: Lightbulb,
  compliment: ThumbsUp,
};

function DescriptionCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > 80 && !expanded;
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="max-w-xs text-left font-noto text-xs text-text hover:text-gold"
    >
      {truncated ? `${text.slice(0, 80)}…` : text}
    </button>
  );
}

/** Beta feedback triage — Filter chips, an unresolved count, and a table with an inline
 * resolve toggle. Shared by SuperAdminDashboard and SubAdminDashboard (both get this tab). */
export default function AdminFeedbackTab() {
  const [entries, setEntries] = useState<BetaFeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("all");

  useEffect(() => {
    getFeedback()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const unresolvedCount = entries.filter((e) => !e.resolved).length;
  const filtered = entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "unresolved") return !e.resolved;
    return e.type === filter;
  });

  async function handleResolve(id: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, resolved: true } : e)));
    try {
      await markFeedbackResolved(id);
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, resolved: false } : e)));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-noto text-xs text-muted">
        {unresolvedCount === 0 ? "No unresolved feedback." : `${unresolvedCount} unresolved.`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors ${
              filter === f.value
                ? "border-clay bg-clay text-ivory"
                : "border-muted2 bg-bg3 text-muted hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center font-noto text-sm text-muted">
          No feedback matches this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-bg4">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="bg-bg2">
                <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Type</th>
                <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Description</th>
                <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Page</th>
                <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Submitted By</th>
                <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Date</th>
                <th className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-t border-bg4 ${entry.resolved ? "opacity-50" : ""}`}
                >
                  <td className="p-3">
                    <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-1 font-syne text-[11px] font-semibold ${TYPE_BADGE[entry.type]}`}>
                      {(() => {
                        const Icon = TYPE_ICON[entry.type];
                        return <Icon className="h-3 w-3" />;
                      })()}
                      {TYPE_LABEL[entry.type]}
                    </span>
                  </td>
                  <td className={`p-3 ${entry.resolved ? "line-through" : ""}`}>
                    <DescriptionCell text={entry.description} />
                  </td>
                  <td className="p-3 font-noto text-xs text-muted">{entry.page}</td>
                  <td className="p-3 font-noto text-xs text-muted">{entry.uid ?? "Anonymous"}</td>
                  <td className="p-3 whitespace-nowrap font-noto text-xs text-muted">
                    {formatTime(entry.createdAt)}
                  </td>
                  <td className="p-3">
                    {entry.resolved ? (
                      <span className="font-noto text-xs text-green2">✓ Resolved</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleResolve(entry.id)}
                        className="rounded-full bg-clay/15 px-3 py-1 font-noto text-[11px] font-semibold text-clay2 hover:bg-clay/25"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
