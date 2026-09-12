"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Modal, Skeleton } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { PlatinumBadge } from "@/components/ui/Badges";
import { formatTime } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { approveApplication, getAllApplications, rejectApplication } from "@/lib/verification";
import type { VerificationApplication, VerificationApplicationStatus } from "@/types";

type FilterValue = VerificationApplicationStatus;

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

/** Beta feedback / 5-tier verification overhaul (Part 4): triages Platinum members' self-service
 * verification applications (submitVerificationApplication in lib/verification.ts) — approve into
 * one of the three verified tiers, or reject with a reason. Shared by SuperAdminDashboard and
 * SubAdminDashboard, same as every other admin tab. */
export default function AdminVerificationTab() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<VerificationApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("pending");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<VerificationApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    getAllApplications()
      .then(setApplications)
      .catch(() => setApplications([]))
      .finally(() => setLoading(false));
  }, []);

  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const filtered = applications.filter((a) => a.status === filter);

  async function handleApprove(app: VerificationApplication, verifiedType?: "creator" | "publisher") {
    if (!user) return;
    setBusyUid(app.uid);
    try {
      await approveApplication(app.uid, user.uid, verifiedType);
      setApplications((prev) =>
        prev.map((a) => (a.uid === app.uid ? { ...a, status: "approved" as const } : a))
      );
      toast.success(`Approved ${app.displayName}.`);
    } catch {
      toast.error("Couldn't approve this application.");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleReject() {
    if (!user || !rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error("Give a reason for the rejection.");
      return;
    }
    setBusyUid(rejectTarget.uid);
    try {
      await rejectApplication(rejectTarget.uid, user.uid, rejectReason);
      setApplications((prev) =>
        prev.map((a) =>
          a.uid === rejectTarget.uid ? { ...a, status: "rejected" as const, rejectionReason: rejectReason } : a
        )
      );
      toast.success(`Rejected ${rejectTarget.displayName}.`);
      setRejectTarget(null);
      setRejectReason("");
    } catch {
      toast.error("Couldn't reject this application.");
    } finally {
      setBusyUid(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-noto text-xs text-muted">
        {pendingCount === 0 ? "No pending applications." : `${pendingCount} pending review.`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors ${
              filter === f.value
                ? "border-clay bg-clay text-ivory"
                : "border-muted2 bg-bg3 text-muted hover:text-text"
            }`}
          >
            {f.label}
            {f.value === "pending" && pendingCount > 0 && (
              <span
                className={`flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-syne text-[10px] font-bold ${
                  filter === f.value ? "bg-ivory/25 text-ivory" : "bg-clay text-ivory"
                }`}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center font-noto text-sm text-muted">No applications here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((app) => (
            <div key={app.uid} className="rounded-2xl border border-bg4 bg-bg2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar uid={app.uid} photoURL={app.photoURL} displayName={app.displayName} size={40} />
                  <div>
                    <p className="flex items-center gap-1.5 font-syne text-sm font-semibold text-text">
                      {app.displayName}
                      <PlatinumBadge isPlatinum className="h-3.5 w-3.5" />
                    </p>
                    {app.handle && <p className="font-noto text-xs text-muted">@{app.handle}</p>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {app.category}
                  </span>
                  <span className="font-noto text-[11px] text-muted">{formatTime(app.submittedAt)}</span>
                </div>
              </div>

              <p className="mt-3 font-noto text-sm text-text">{app.reason}</p>

              {app.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {app.links.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-full bg-bg3 px-2.5 py-1 font-noto text-xs text-gold hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> {link.replace(/^https?:\/\//, "").slice(0, 40)}
                    </a>
                  ))}
                </div>
              )}

              {app.status === "rejected" && app.rejectionReason && (
                <p className="mt-3 rounded-lg border border-dashed border-clay2/40 bg-clay2/5 p-2 font-noto text-xs text-clay2">
                  Rejected: {app.rejectionReason}
                </p>
              )}

              {app.status === "pending" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(app, "creator")}
                    disabled={busyUid === app.uid}
                    className="flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1.5 font-noto text-xs font-semibold text-blue-400 hover:bg-blue-500/25 disabled:opacity-50"
                  >
                    {busyUid === app.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Approve as Creator
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(app, "publisher")}
                    disabled={busyUid === app.uid}
                    className="flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3 py-1.5 font-noto text-xs font-semibold text-purple-400 hover:bg-purple-500/25 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Approve as Publisher
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(app)}
                    disabled={busyUid === app.uid}
                    className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 font-noto text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve (General)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget(app);
                      setRejectReason("");
                    }}
                    disabled={busyUid === app.uid}
                    className="flex items-center gap-1.5 rounded-full bg-clay2/15 px-3 py-1.5 font-noto text-xs font-semibold text-clay2 hover:bg-clay2/25 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}
              {app.status === "approved" && (
                <p className="mt-3 flex items-center gap-1.5 font-noto text-xs text-green2">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Application">
        <div className="flex flex-col gap-3">
          <p className="font-noto text-sm text-muted">
            Rejecting <span className="text-text">{rejectTarget?.displayName}</span>&apos;s application.
          </p>
          <textarea
            autoFocus
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Reason for rejection..."
            className="input-base w-full resize-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRejectTarget(null)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={busyUid === rejectTarget?.uid}
              className="btn-primary text-sm"
            >
              {busyUid === rejectTarget?.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
