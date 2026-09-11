"use client";

import { useEffect, useState } from "react";
import { getApprovedSeriesForAdmin, getWorksByStatus } from "@/lib/admin";
import { Skeleton, Tabs } from "@/components/ui";
import type { CreatorWork, PublishedSeries, UserProfile } from "@/types";
import ApprovedWorkCard from "./ApprovedWorkCard";
import PendingWorkCard from "./PendingWorkCard";
import RejectedWorkCard from "./RejectedWorkCard";

export interface AdminWorksTabProps {
  users: UserProfile[];
}

type WorksSubTab = "pending" | "approved" | "rejected";

const SUB_TABS: { label: string; value: WorksSubTab }[] = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

/** Works review queue with Pending/Approved/Rejected sub-tabs, each independently loaded.
 * Approved is sourced from `publishedSeries` (see getApprovedSeriesForAdmin's doc comment) —
 * every other sub-tab still reads `creatorWorks`, which IS where pending/rejected submissions
 * actually live. */
export default function AdminWorksTab({ users }: AdminWorksTabProps) {
  const [sub, setSub] = useState<WorksSubTab>("pending");
  const [works, setWorks] = useState<CreatorWork[]>([]);
  const [approvedSeries, setApprovedSeries] = useState<PublishedSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load =
      sub === "approved"
        ? getApprovedSeriesForAdmin().then((s) => {
            if (!cancelled) setApprovedSeries(s);
          })
        : getWorksByStatus(sub).then((w) => {
            if (!cancelled) setWorks(w);
          });
    load
      .catch(() => {
        if (cancelled) return;
        if (sub === "approved") setApprovedSeries([]);
        else setWorks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sub]);

  const authorLookup = new Map(users.map((u) => [u.uid, u.displayName]));

  function handleResolved(workId: string) {
    setWorks((prev) => prev.filter((w) => w.id !== workId));
  }

  function handleSeriesUpdated(workId: string, patch: Partial<PublishedSeries>) {
    setApprovedSeries((prev) => prev.map((s) => (s.id === workId ? { ...s, ...patch } : s)));
  }

  function handleSeriesDeleted(workId: string) {
    setApprovedSeries((prev) => prev.filter((s) => s.id !== workId));
  }

  const isEmpty = sub === "approved" ? approvedSeries.length === 0 : works.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Tabs tabs={SUB_TABS} value={sub} onChange={(v) => setSub(v as WorksSubTab)} />

      <div className="flex flex-col gap-4">
        {loading ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)
        ) : isEmpty ? (
          <p className="font-noto text-sm text-muted">No {sub} works right now.</p>
        ) : sub === "pending" ? (
          works.map((w) => (
            <PendingWorkCard
              key={w.id}
              work={w}
              authorName={authorLookup.get(w.creatorId) ?? "Unknown creator"}
              onResolved={handleResolved}
            />
          ))
        ) : sub === "approved" ? (
          approvedSeries.map((s) => (
            <ApprovedWorkCard
              key={s.id}
              series={s}
              onUpdated={handleSeriesUpdated}
              onDeleted={handleSeriesDeleted}
            />
          ))
        ) : (
          works.map((w) => (
            <RejectedWorkCard
              key={w.id}
              work={w}
              authorName={authorLookup.get(w.creatorId) ?? "Unknown creator"}
              onResolved={handleResolved}
            />
          ))
        )}
      </div>
    </div>
  );
}
