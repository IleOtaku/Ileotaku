"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BadgeCheck, Loader2, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import {
  approveGroupVerification,
  getAllGroupVerificationRequests,
  rejectGroupVerification,
  type GroupVerificationRequest,
} from "@/lib/groupVerification";
import { formatTime } from "@/lib/utils";

/** Admin → Verification → "Group verification": the queue of groups whose admins applied for the verified
 * badge (lib/groupVerification.ts). Approve grants it; reject needs a reason, which is sent to the applicant. */
export default function AdminGroupVerificationSection() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<GroupVerificationRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    getAllGroupVerificationRequests()
      .then(setRequests)
      .catch(() => setRequests([]));
  }, []);

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const decided = (requests ?? []).filter((r) => r.status !== "pending").slice(0, 10);

  async function act(r: GroupVerificationRequest, kind: "approve" | "reject") {
    if (!user) return;
    if (kind === "reject" && !reason.trim()) {
      toast.error("Give a reason for the rejection.");
      return;
    }
    setBusy(r.conversationId);
    try {
      if (kind === "approve") await approveGroupVerification(r, user.uid);
      else await rejectGroupVerification(r, user.uid, reason);
      setRequests((prev) =>
        (prev ?? []).map((x) =>
          x.conversationId === r.conversationId
            ? { ...x, status: kind === "approve" ? "approved" : "rejected", ...(kind === "reject" ? { rejectionReason: reason.trim() } : {}) }
            : x
        )
      );
      setRejecting(null);
      setReason("");
      toast.success(kind === "approve" ? `"${r.groupName}" is now verified.` : "Application rejected.");
    } catch {
      toast.error("Couldn't update this application.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 border-t border-bg4 pt-6" data-testid="admin-group-verification">
      <h3 className="mb-1 flex items-center gap-2 font-syne text-sm font-semibold text-text">
        <BadgeCheck className="h-4 w-4 text-plat" /> Group verification
      </h3>
      <p className="mb-4 font-noto text-xs text-muted">
        {requests === null ? "Loading…" : pending.length === 0 ? "No groups waiting for review." : `${pending.length} group${pending.length === 1 ? "" : "s"} waiting for review.`}
      </p>

      <div className="flex flex-col gap-3">
        {pending.map((r) => (
          <div key={r.conversationId} className="rounded-xl border border-bg4 bg-bg2 p-4" data-testid="group-verification-request">
            <div className="flex items-center gap-3">
              <Avatar uid={r.conversationId} photoURL={r.groupPhotoURL} displayName={r.groupName} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-syne text-sm font-semibold text-text">{r.groupName}</p>
                <p className="flex items-center gap-1 font-noto text-[11px] text-muted">
                  <Users className="h-3 w-3" /> {r.memberCount} members · applied by {r.requestedByName} · {formatTime(r.createdAt)}
                </p>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap font-noto text-xs text-text">{r.reason}</p>
            {rejecting === r.conversationId ? (
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Reason for rejection..."
                  className="input-base w-full resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setRejecting(null)} className="btn-ghost text-xs">
                    Cancel
                  </button>
                  <button type="button" onClick={() => act(r, "reject")} disabled={busy === r.conversationId} className="btn-primary text-xs">
                    {busy === r.conversationId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setRejecting(r.conversationId)} className="btn-ghost text-xs">
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => act(r, "approve")}
                  disabled={busy === r.conversationId}
                  data-testid="group-verification-approve"
                  className="btn-primary inline-flex items-center gap-1.5 text-xs"
                >
                  {busy === r.conversationId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />} Verify group
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {decided.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">Recently reviewed</p>
          <ul className="flex flex-col gap-1">
            {decided.map((r) => (
              <li key={r.conversationId} className="flex items-center justify-between gap-2 font-noto text-xs text-muted">
                <span className="truncate">{r.groupName}</span>
                <span className={r.status === "approved" ? "text-green2" : "text-clay2"}>{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
