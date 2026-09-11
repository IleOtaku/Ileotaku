"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { approveAppeal, denyAppeal, getAppeals } from "@/lib/admin";
import { useAuth } from "@/hooks/useAuth";
import { formatTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import type { Appeal, AppealStatus } from "@/types";

type FilterValue = "all" | AppealStatus;

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Denied", value: "denied" },
];

const STATUS_BADGE: Record<AppealStatus, string> = {
  pending: "bg-gold/15 text-gold2",
  approved: "bg-green/15 text-green2",
  denied: "bg-red-900/40 text-red-200",
};

/** Ban-appeal review queue — Super Admin only (see SuperAdminDashboard's tab list). Approving
 * unbans the account and notifies them; denying leaves the ban in place with its own notice. */
export default function AdminAppealsTab() {
  const { user } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    getAppeals()
      .then(setAppeals)
      .catch(() => setAppeals([]))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  const filtered = appeals.filter((a) => filter === "all" || a.status === filter);

  async function handleApprove(appeal: Appeal) {
    if (!user) return;
    setBusyId(appeal.id);
    try {
      await approveAppeal(appeal.id, appeal.uid, user.uid);
      setAppeals((prev) => prev.map((a) => (a.id === appeal.id ? { ...a, status: "approved" } : a)));
      toast.success("Appeal approved — the account has been unbanned.");
    } catch {
      toast.error("Couldn't approve this appeal. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeny(appeal: Appeal) {
    if (!user) return;
    setBusyId(appeal.id);
    try {
      await denyAppeal(appeal.id, appeal.uid, user.uid);
      setAppeals((prev) => prev.map((a) => (a.id === appeal.id ? { ...a, status: "denied" } : a)));
      toast.success("Appeal denied.");
    } catch {
      toast.error("Couldn't deny this appeal. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
        <p className="py-10 text-center font-noto text-sm text-muted">No appeals match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-bg4">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="bg-bg2">
                {["User", "Ban Reason", "Appeal", "Submitted", "Status", ""].map((h) => (
                  <th key={h} className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((appeal) => (
                <tr key={appeal.id} className="border-t border-bg4">
                  <td className="p-3">
                    <p className="font-noto text-sm text-text">{appeal.displayName}</p>
                    <p className="font-noto text-xs text-muted">{appeal.email}</p>
                  </td>
                  <td className="max-w-[160px] p-3 font-noto text-xs text-muted">
                    {appeal.banReason ?? "—"}
                  </td>
                  <td className="max-w-xs p-3 font-noto text-xs text-text">{appeal.reason}</td>
                  <td className="whitespace-nowrap p-3 font-noto text-xs text-muted">
                    {formatTime(appeal.submittedAt)}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 font-syne text-[11px] font-semibold ${STATUS_BADGE[appeal.status]}`}>
                      {appeal.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {appeal.status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(appeal)}
                          disabled={busyId === appeal.id}
                          className="rounded-full bg-green/15 px-3 py-1 font-noto text-[11px] font-semibold text-green2 hover:bg-green/25 disabled:opacity-50"
                        >
                          {busyId === appeal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeny(appeal)}
                          disabled={busyId === appeal.id}
                          className="rounded-full bg-red-900/40 px-3 py-1 font-noto text-[11px] font-semibold text-red-200 hover:bg-red-900/60 disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </div>
                    ) : (
                      <span className="font-noto text-xs text-muted">
                        Reviewed {appeal.reviewedAt ? formatTime(appeal.reviewedAt) : ""}
                      </span>
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
