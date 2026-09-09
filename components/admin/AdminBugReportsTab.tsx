"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { addBugReportNote, getBugReports, updateBugReportStatus } from "@/lib/admin";
import { Skeleton } from "@/components/ui";
import { formatTime } from "@/lib/utils";
import type { BugReport, BugReportStatus } from "@/types";

const STATUS_FLOW: Record<BugReportStatus, BugReportStatus | null> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: null,
};

const STATUS_LABEL: Record<BugReportStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const STATUS_CLASS: Record<BugReportStatus, string> = {
  open: "bg-clay/15 text-clay2",
  in_progress: "bg-gold/15 text-gold",
  resolved: "bg-green/15 text-green2",
};

function BugCard({ bug, onUpdated }: { bug: BugReport; onUpdated: (id: string, patch: Partial<BugReport>) => void }) {
  const [advancing, setAdvancing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(bug.note ?? "");
  const [savingNote, setSavingNote] = useState(false);

  const nextStatus = STATUS_FLOW[bug.status];

  async function handleAdvance() {
    if (!nextStatus) return;
    setAdvancing(true);
    try {
      await updateBugReportStatus(bug.id, nextStatus);
      onUpdated(bug.id, { status: nextStatus });
      toast.success(`Marked ${STATUS_LABEL[nextStatus]}.`);
    } catch {
      toast.error("Couldn't update this bug report.");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleSaveNote() {
    setSavingNote(true);
    try {
      await addBugReportNote(bug.id, note);
      onUpdated(bug.id, { note });
      toast.success("Note saved — visible to the reporter.");
      setNoteOpen(false);
    } catch {
      toast.error("Couldn't save this note.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-syne text-sm font-semibold text-text">{bug.title}</h3>
          <p className="font-noto text-[11px] text-muted">
            {bug.reportedByName ?? "Anonymous"} · {formatTime(bug.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 font-noto text-[10px] font-semibold ${STATUS_CLASS[bug.status]}`}>
          {STATUS_LABEL[bug.status]}
        </span>
      </div>

      <p className="mt-3 font-noto text-sm text-text">{bug.description}</p>

      {bug.stepsToReproduce && (
        <div className="mt-2">
          <p className="font-syne text-xs font-semibold text-muted">Steps to reproduce</p>
          <p className="font-noto text-xs text-muted">{bug.stepsToReproduce}</p>
        </div>
      )}
      {(bug.expectedBehavior || bug.actualBehavior) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {bug.expectedBehavior && (
            <div>
              <p className="font-syne text-xs font-semibold text-muted">Expected</p>
              <p className="font-noto text-xs text-muted">{bug.expectedBehavior}</p>
            </div>
          )}
          {bug.actualBehavior && (
            <div>
              <p className="font-syne text-xs font-semibold text-muted">Actual</p>
              <p className="font-noto text-xs text-muted">{bug.actualBehavior}</p>
            </div>
          )}
        </div>
      )}
      <p className="mt-2 font-noto text-[11px] text-muted">{bug.browserInfo}</p>

      {bug.note && (
        <p className="mt-3 rounded-lg border border-dashed border-gold/40 bg-gold/5 p-2 font-noto text-xs text-gold">
          Team note: {bug.note}
        </p>
      )}

      {noteOpen && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note visible to the reporter..."
            className="input-base resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNoteOpen(false)} className="btn-ghost text-xs">
              Cancel
            </button>
            <button type="button" onClick={handleSaveNote} disabled={savingNote} className="btn-primary text-xs disabled:opacity-50">
              {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Note"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setNoteOpen((o) => !o)} className="btn-ghost text-xs">
          Add Note
        </button>
        {nextStatus && (
          <button type="button" onClick={handleAdvance} disabled={advancing} className="btn-primary text-xs disabled:opacity-50">
            {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Mark ${STATUS_LABEL[nextStatus]}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Bug Reports tab: reads the `bugReports` collection the Footer's report-a-bug modal writes
 * to. Status flows one-way Open → In Progress → Resolved; a note left here shows back to the
 * reporter on their own profile. */
export default function AdminBugReportsTab() {
  const [status, setStatus] = useState<BugReportStatus | "all">("open");
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBugReports(status === "all" ? undefined : status)
      .then((b) => {
        if (!cancelled) setBugs(b);
      })
      .catch(() => {
        if (!cancelled) setBugs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  function handleUpdated(id: string, patch: Partial<BugReport>) {
    setBugs((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-full border border-muted2 bg-bg3 p-1" style={{ width: "fit-content" }}>
        {(["open", "in_progress", "resolved", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 font-noto text-xs transition-colors ${
              status === s ? "bg-clay text-ivory" : "text-muted hover:text-text"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : bugs.length === 0 ? (
        <p className="font-noto text-sm text-muted">No bug reports match this filter.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {bugs.map((bug) => (
            <BugCard key={bug.id} bug={bug} onUpdated={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
