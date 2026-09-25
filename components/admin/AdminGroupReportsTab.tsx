"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Loader2, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import {
  adminDeleteGroupForReport,
  dismissGroupReport,
  escalateGroupReport,
  permaBanGroupMembers,
  subscribeToGroupReports,
  tempBanGroupMembers,
} from "@/lib/groupReports";
import { formatTime } from "@/lib/utils";
import type { GroupReport, GroupReportStatus } from "@/types";

const STATUS_LABEL: Record<GroupReportStatus, string> = {
  pending: "Pending",
  under_review: "Under review",
  escalated: "Escalated",
  resolved: "Resolved",
};
const STATUS_BADGE: Record<GroupReportStatus, string> = {
  pending: "bg-gold/15 text-gold2",
  under_review: "bg-plat/15 text-plat2",
  escalated: "bg-red-500/15 text-red-400",
  resolved: "bg-green/15 text-green2",
};
const REASON_LABEL: Record<GroupReport["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  underage: "Underage content",
  other: "Other",
};

export interface AdminGroupReportsTabProps {
  /** Perma-ban and Delete Group are Super Admin only — a Sub Admin's only path to either is
   * Escalate. */
  isSuperAdmin: boolean;
}

/** Beta feedback: "Add a gc report feature... Add Group Reports tab to SubAdminDashboard and
 * SuperAdminDashboard: shows all pending group reports... expandable: shows the last 15
 * messages... Sub Admin: Temp Ban Group Members + Dismiss + Escalate to Super Admin. Super Admin:
 * Permanent Ban Members + Delete Group + Dismiss + Approve Sub Admin request." Shared by both
 * dashboards (SubAdminDashboard renders SuperAdminDashboard with isSuperAdmin=false), same
 * pattern as every other admin tab in this app. */
export default function AdminGroupReportsTab({ isSuperAdmin }: AdminGroupReportsTabProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<GroupReport[] | null>(null);
  const [filter, setFilter] = useState<GroupReportStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [escalationNote, setEscalationNote] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => subscribeToGroupReports(setReports), []);

  const filtered = (reports ?? []).filter((r) => filter === "all" || r.status === filter);
  const pendingCount = (reports ?? []).filter((r) => r.status === "pending" || r.status === "escalated").length;

  async function runAction(reportId: string, fn: () => Promise<void>, successMessage: string) {
    setActingId(reportId);
    try {
      await fn();
      toast.success(successMessage);
      setExpandedId(null);
      setEscalatingId(null);
    } catch {
      toast.error("That action failed. Please try again.");
    } finally {
      setActingId(null);
    }
  }

  if (reports === null) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "pending", "escalated", "resolved"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1.5 font-noto text-xs font-semibold ${
                filter === s ? "border-clay bg-clay text-ivory" : "border-muted2 bg-bg3 text-muted hover:text-text"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="font-noto text-xs text-muted">
          {pendingCount === 0 ? "No reports need attention." : `${pendingCount} need attention.`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-muted2 bg-bg3 p-6 text-center font-noto text-sm text-muted">
          Nothing here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) => {
            const expanded = expandedId === r.id;
            const acting = actingId === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-bg4 bg-bg2 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar uid={r.groupId} photoURL={r.groupPhotoURL} displayName={r.groupName} size={36} />
                    <div className="min-w-0">
                      <p className="truncate font-syne text-sm font-semibold text-text">{r.groupName}</p>
                      <p className="truncate font-noto text-xs text-muted">
                        {REASON_LABEL[r.reason]} · reported by {r.reportedByName} · {formatTime(r.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 font-noto text-[11px] font-semibold ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                  </div>
                </button>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-bg4 pt-3">
                    <p className="font-noto text-sm text-text">{r.description}</p>

                    {r.escalationNote && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5">
                        <p className="font-syne text-xs font-semibold text-red-400">Escalation note</p>
                        <p className="mt-0.5 font-noto text-xs text-text">{r.escalationNote}</p>
                      </div>
                    )}

                    <div>
                      <p className="mb-1.5 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                        Last {r.last15Messages.length} messages
                      </p>
                      <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto rounded-lg bg-bg3 p-2.5">
                        {r.last15Messages.length === 0 ? (
                          <p className="font-noto text-xs text-muted">No messages captured.</p>
                        ) : (
                          r.last15Messages.map((m) => (
                            <p key={m.id} className="font-noto text-xs text-text">
                              <span className="font-semibold">{m.senderName}:</span> {m.text || "[media]"}{" "}
                              <span className="text-muted">· {formatTime(m.createdAt)}</span>
                            </p>
                          ))
                        )}
                      </div>
                    </div>

                    {r.status !== "resolved" && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-bg4 pt-3">
                        <button
                          type="button"
                          disabled={acting}
                          onClick={() =>
                            runAction(r.id, () => tempBanGroupMembers(r.id, r.groupId, user!.uid), "Members temp-banned for 7 days.")
                          }
                          className="rounded-full bg-clay px-3 py-1.5 font-noto text-xs font-semibold text-ivory hover:bg-clay2 disabled:opacity-50"
                        >
                          {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Temp Ban Group Members"}
                        </button>

                        {r.status !== "escalated" && (
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() => setEscalatingId(escalatingId === r.id ? null : r.id)}
                            className="rounded-full bg-bg3 px-3 py-1.5 font-noto text-xs font-semibold text-text hover:bg-bg4 disabled:opacity-50"
                          >
                            Escalate to Super Admin
                          </button>
                        )}

                        {isSuperAdmin && (
                          <>
                            <button
                              type="button"
                              disabled={acting}
                              onClick={() =>
                                runAction(r.id, () => permaBanGroupMembers(r.id, r.groupId, user!.uid), "Members permanently banned.")
                              }
                              className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 font-noto text-xs font-semibold text-ivory hover:bg-red-500 disabled:opacity-50"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" /> Permanent Ban Members
                            </button>
                            <button
                              type="button"
                              disabled={acting}
                              onClick={() =>
                                runAction(r.id, () => adminDeleteGroupForReport(r.id, r.groupId, user!.uid), "Group deleted.")
                              }
                              className="rounded-full border border-red-500/40 px-3 py-1.5 font-noto text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                            >
                              Delete Group
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          disabled={acting}
                          onClick={() => runAction(r.id, () => dismissGroupReport(r.id, user!.uid), "Report dismissed.")}
                          className="rounded-full px-3 py-1.5 font-noto text-xs font-semibold text-muted hover:bg-bg3 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {escalatingId === r.id && (
                      <div className="flex flex-col gap-2 rounded-lg border border-bg4 bg-bg p-3">
                        <textarea
                          value={escalationNote}
                          onChange={(e) => setEscalationNote(e.target.value)}
                          rows={2}
                          placeholder="Note for the Super Admin — why does this need their review?"
                          className="input-base resize-none text-xs"
                        />
                        <button
                          type="button"
                          disabled={acting || !escalationNote.trim()}
                          onClick={() =>
                            runAction(
                              r.id,
                              async () => {
                                await escalateGroupReport(r.id, user!.uid, escalationNote);
                                setEscalationNote("");
                              },
                              "Escalated to Super Admin."
                            )
                          }
                          className="btn-primary self-end text-xs disabled:opacity-40"
                        >
                          {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send to Super Admin"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
