"use client";

import { useEffect, useState } from "react";
import { getReports } from "@/lib/admin";
import { Skeleton } from "@/components/ui";
import type { Report, ReportStatus, ReportTargetType } from "@/types";
import ReportCard from "./ReportCard";

const TARGET_OPTIONS: { label: string; value: ReportTargetType | "all" }[] = [
  { label: "All types", value: "all" },
  { label: "Comment", value: "comment" },
  { label: "Chapter", value: "chapter" },
  { label: "Series", value: "series" },
  { label: "User", value: "user" },
  { label: "Direct message", value: "dm" },
];

const STATUS_OPTIONS: { label: string; value: ReportStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Resolved", value: "resolved" },
  { label: "Actioned", value: "actioned" },
];

/** Reports queue with targetType/status filters — reuses ReportCard for each row. */
export default function AdminReportsTab() {
  const [targetType, setTargetType] = useState<ReportTargetType | "all">("all");
  const [status, setStatus] = useState<ReportStatus | "all">("pending");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getReports({
      targetType: targetType === "all" ? undefined : targetType,
      status: status === "all" ? undefined : status,
    })
      .then((r) => {
        // Platinum reporters' reports surface first — Sprint 9e's Priority Queue perk.
        // Backend-only ordering; nothing about this is visible to the reporter.
        const sorted = [...r].sort(
          (a, b) => Number(b.reporterIsPlatinum === true) - Number(a.reporterIsPlatinum === true)
        );
        if (!cancelled) setReports(sorted);
      })
      .catch(() => {
        if (!cancelled) setReports([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetType, status]);

  function handleResolved(reportId: string) {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as ReportTargetType | "all")}
          className="input-base w-auto text-sm"
        >
          {TARGET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ReportStatus | "all")}
          className="input-base w-auto text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-4">
        {loading ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : reports.length === 0 ? (
          status === "pending" && targetType === "all" ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-muted2 px-6 py-16 text-center">
              <span className="text-4xl">✓</span>
              <h3 className="font-cinzel text-lg text-text">No Pending Reports</h3>
              <p className="font-noto text-sm text-muted">The community is behaving itself.</p>
            </div>
          ) : (
            <p className="font-noto text-sm text-muted">No reports match these filters.</p>
          )
        ) : (
          reports.map((report) => <ReportCard key={report.id} report={report} onResolved={handleResolved} />)
        )}
      </div>
    </div>
  );
}
