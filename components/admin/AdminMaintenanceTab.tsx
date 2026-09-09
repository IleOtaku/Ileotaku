"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  approveMaintenanceRequest,
  deactivateMaintenance,
  getMaintenanceRequests,
  getMaintenanceState,
  rejectMaintenanceRequest,
  submitMaintenanceRequest,
} from "@/lib/admin";
import { useAuth } from "@/hooks/useAuth";
import type { MaintenanceRequest, MaintenanceState, MaintenanceSystem } from "@/types";

const SYSTEM_OPTIONS: { label: string; value: MaintenanceSystem }[] = [
  { label: "Reader", value: "reader" },
  { label: "Auth", value: "auth" },
  { label: "Payments", value: "payments" },
  { label: "Notifications", value: "notifications" },
  { label: "All", value: "all" },
];

function useCountdown(target?: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return "";
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "starting now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${h > 0 ? `${h}h ` : ""}${m}m ${s}s`;
}

export interface AdminMaintenanceTabProps {
  /** Only Super/Sub-Admins can approve or reject a submitted request — Technical staff can
   * only submit them and watch the queue. */
  canApprove: boolean;
}

/** Maintenance mode: current live status, a request-submission form, the pending queue
 * (awaiting Super Admin approval), and a countdown to the next approved window. */
export default function AdminMaintenanceTab({ canApprove }: AdminMaintenanceTabProps) {
  const { profile } = useAuth();
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [systems, setSystems] = useState<MaintenanceSystem[]>([]);

  const countdown = useCountdown(state?.isActive ? undefined : requests.find((r) => r.status === "approved")?.startTime);

  function loadAll() {
    setLoading(true);
    Promise.all([getMaintenanceState(), getMaintenanceRequests()])
      .then(([s, r]) => {
        setState(s);
        setRequests(r);
      })
      .catch(() => toast.error("Couldn't load maintenance data."))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, []);

  function toggleSystem(system: MaintenanceSystem) {
    setSystems((prev) => (prev.includes(system) ? prev.filter((s) => s !== system) : [...prev, system]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !startTime || !endTime || !reason.trim() || systems.length === 0) {
      toast.error("Fill in start, end, reason, and at least one affected system.");
      return;
    }
    setSubmitting(true);
    try {
      await submitMaintenanceRequest({
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        reason: reason.trim(),
        affectedSystems: systems,
        requestedBy: profile.uid,
        requestedByName: profile.displayName,
      });
      toast.success("Request submitted for approval.");
      setStartTime("");
      setEndTime("");
      setReason("");
      setSystems([]);
      loadAll();
    } catch {
      toast.error("Couldn't submit this request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(request: MaintenanceRequest) {
    setProcessingId(request.id);
    try {
      await approveMaintenanceRequest(request);
      toast.success("Approved and activated.");
      loadAll();
    } catch {
      toast.error("Couldn't approve this request.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(requestId: string) {
    setProcessingId(requestId);
    try {
      await rejectMaintenanceRequest(requestId);
      toast.success("Request rejected.");
      loadAll();
    } catch {
      toast.error("Couldn't reject this request.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDeactivate() {
    setProcessingId("deactivate");
    try {
      await deactivateMaintenance();
      toast.success("Maintenance mode deactivated.");
      loadAll();
    } catch {
      toast.error("Couldn't deactivate maintenance mode.");
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) return <p className="font-noto text-sm text-muted">Loading...</p>;

  const pending = requests.filter((r) => r.status === "pending");
  const approvedUpcoming = requests.find((r) => r.status === "approved" && new Date(r.endTime) > new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className={`rounded-2xl border p-5 ${state?.isActive ? "border-clay bg-clay/10" : "border-bg4 bg-bg2"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`h-3 w-3 rounded-full ${state?.isActive ? "bg-clay2" : "bg-green2"}`} />
            <div>
              <p className="font-syne text-sm font-semibold text-text">
                Maintenance Mode: {state?.isActive ? "Active" : "Inactive"}
              </p>
              {state?.isActive && state.reason && <p className="font-noto text-xs text-muted">{state.reason}</p>}
              {state?.isActive && state.endTime && (
                <p className="font-noto text-xs text-muted">Ends {new Date(state.endTime).toLocaleString()}</p>
              )}
            </div>
          </div>
          {state?.isActive && canApprove && (
            <button type="button" onClick={handleDeactivate} disabled={processingId === "deactivate"} className="btn-ghost text-xs disabled:opacity-50">
              {processingId === "deactivate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Deactivate"}
            </button>
          )}
        </div>

        {!state?.isActive && approvedUpcoming && (
          <p className="mt-3 font-noto text-xs text-gold">
            Next window starts in {countdown} — {approvedUpcoming.reason}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-4 font-syne text-sm font-semibold text-text">Submit Maintenance Request</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="font-syne text-xs font-semibold text-muted">Start</label>
            <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-base text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-syne text-xs font-semibold text-muted">End</label>
            <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-base text-sm" />
          </div>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason for maintenance"
          className="input-base mt-4 resize-none text-sm"
        />
        <div className="mt-4">
          <p className="mb-2 font-syne text-xs font-semibold text-muted">Affected systems</p>
          <div className="flex flex-wrap gap-3">
            {SYSTEM_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 font-noto text-xs text-text">
                <input
                  type="checkbox"
                  checked={systems.includes(opt.value)}
                  onChange={() => toggleSystem(opt.value)}
                  className="h-3.5 w-3.5 accent-clay"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary mt-4 text-sm disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Request"}
        </button>
      </form>

      <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
        <h3 className="mb-3 font-syne text-sm font-semibold text-text">Pending Requests</h3>
        {pending.length === 0 ? (
          <p className="font-noto text-sm text-muted">Nothing awaiting approval.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-syne text-sm font-semibold text-text">{r.reason}</p>
                  <p className="font-noto text-[11px] text-muted">
                    {new Date(r.startTime).toLocaleString()} → {new Date(r.endTime).toLocaleString()} · {r.affectedSystems.join(", ")} · requested by {r.requestedByName}
                  </p>
                </div>
                {canApprove && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprove(r)}
                      disabled={processingId === r.id}
                      className="flex items-center gap-1 rounded-full bg-green px-3 py-1.5 font-noto text-xs font-semibold text-ivory hover:bg-green2 disabled:opacity-50"
                    >
                      {processingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(r.id)}
                      disabled={processingId === r.id}
                      className="flex items-center gap-1 rounded-full border border-muted2 px-3 py-1.5 font-noto text-xs text-muted hover:text-text disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
