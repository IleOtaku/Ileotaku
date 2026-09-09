"use client";

import { useEffect, useState } from "react";
import { getWorksByStatus } from "@/lib/admin";
import { Skeleton, Tabs } from "@/components/ui";
import type { CreatorWork, UserProfile } from "@/types";
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

/** Works review queue with Pending/Approved/Rejected sub-tabs, each independently loaded. */
export default function AdminWorksTab({ users }: AdminWorksTabProps) {
  const [sub, setSub] = useState<WorksSubTab>("pending");
  const [works, setWorks] = useState<CreatorWork[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWorksByStatus(sub)
      .then((w) => {
        if (!cancelled) setWorks(w);
      })
      .catch(() => {
        if (!cancelled) setWorks([]);
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

  function handleUpdated(workId: string, patch: Partial<CreatorWork>) {
    setWorks((prev) => prev.map((w) => (w.id === workId ? { ...w, ...patch } : w)));
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs tabs={SUB_TABS} value={sub} onChange={(v) => setSub(v as WorksSubTab)} />

      <div className="flex flex-col gap-4">
        {loading ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)
        ) : works.length === 0 ? (
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
          works.map((w) => (
            <ApprovedWorkCard
              key={w.id}
              work={w}
              authorName={authorLookup.get(w.creatorId) ?? "Unknown creator"}
              onUpdated={handleUpdated}
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
