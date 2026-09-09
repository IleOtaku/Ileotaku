"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui";
import { actionReport, dismissReport } from "@/lib/firestore";
import { formatTime } from "@/lib/utils";
import type { ModerationAction, Report } from "@/types";

export interface ReportCardProps {
  report: Report;
  onResolved: (reportId: string) => void;
}

const ACTION_OPTIONS: { label: string; value: ModerationAction }[] = [
  { label: "Warn User", value: "warn" },
  { label: "Suspend 7 days", value: "suspend7" },
  { label: "Permanent Ban", value: "ban" },
  { label: "Delete Content", value: "delete_content" },
];

const REASON_LABEL: Record<Report["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  copyright: "Copyright violation",
  underage: "Underage content",
  other: "Other",
};

const TARGET_LABEL: Record<Report["targetType"], string> = {
  comment: "Comment",
  chapter: "Chapter",
  series: "Series",
  user: "User",
  dm: "Direct message",
  post: "Feed post",
};

/** One pending report — reporter, target, reason/details — with Dismiss / Take Action controls. */
export default function ReportCard({ report, onResolved }: ReportCardProps) {
  const [processing, setProcessing] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);

  async function handleDismiss() {
    setProcessing(true);
    try {
      await dismissReport(report.id);
      toast.success("Report dismissed.");
      onResolved(report.id);
    } catch {
      toast.error("Couldn't dismiss this report.");
      setProcessing(false);
    }
  }

  async function handleAction(action: ModerationAction) {
    setProcessing(true);
    try {
      await actionReport(report.id, action, report.targetUserId);
      toast.success("Action taken.");
      setActionOpen(false);
      onResolved(report.id);
    } catch {
      toast.error("Couldn't apply this action.");
      setProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-bg4 bg-bg2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-clay2" />
          <Link
            href={`/profile/${report.reporterId}`}
            className="font-syne text-sm font-semibold text-text hover:text-gold hover:underline"
          >
            {report.reporterName}
          </Link>
          <span className="rounded-full bg-bg3 px-2 py-0.5 font-noto text-[10px] text-muted">
            {TARGET_LABEL[report.targetType]}
          </span>
          {report.reporterIsPlatinum === true && (
            <span className="rounded-full bg-plat/15 px-2 py-0.5 font-noto text-[10px] font-semibold text-plat2">
              💎 Priority
            </span>
          )}
          {report.status !== "pending" && (
            <span className="rounded-full bg-bg4 px-2 py-0.5 font-noto text-[10px] uppercase tracking-wide text-muted">
              {report.status}
            </span>
          )}
        </div>
        <span className="font-noto text-[11px] text-muted">{formatTime(report.createdAt)}</span>
      </div>

      <p className="font-noto text-sm text-text">{REASON_LABEL[report.reason]}</p>
      {report.details && <p className="font-noto text-xs text-muted">{report.details}</p>}

      {report.status === "pending" && (
      <div className="flex gap-2">
        <button type="button" onClick={handleDismiss} disabled={processing} className="btn-ghost text-sm">
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => setActionOpen(true)}
          disabled={processing}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-syne text-sm font-semibold text-ivory transition-colors hover:bg-red-500 disabled:opacity-50"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Take Action"}
        </button>
      </div>
      )}

      <Modal open={actionOpen} onClose={() => setActionOpen(false)} title="Take action">
        <div className="flex flex-col gap-2">
          {ACTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleAction(opt.value)}
              disabled={processing}
              className="btn-ghost justify-start text-sm"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
