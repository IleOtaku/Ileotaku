"use client";

import { Fragment, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { getErrorLogs, resolveErrorLog } from "@/lib/admin";
import { Skeleton } from "@/components/ui";
import { formatTime } from "@/lib/utils";
import type { ErrorLogEntry, ErrorLogStatus } from "@/types";

const STATUS_OPTIONS: { label: string; value: ErrorLogStatus | "all" }[] = [
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
  { label: "All", value: "all" },
];

/** Error Logs tab: reads the `errors` collection lib/errorLogger.ts writes to. Expand a row
 * for the full stack trace; filter by status and (client-side) by a date range. */
export default function AdminErrorLogsTab() {
  const [status, setStatus] = useState<ErrorLogStatus | "all">("open");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getErrorLogs(status === "all" ? undefined : status)
      .then((e) => {
        if (!cancelled) setErrors(e);
      })
      .catch(() => {
        if (!cancelled) setErrors([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const filtered = errors.filter((e) => {
    if (dateFrom && e.createdAt < dateFrom) return false;
    if (dateTo && e.createdAt > `${dateTo}T23:59:59`) return false;
    return true;
  });

  async function handleResolve(errorId: string) {
    setResolvingId(errorId);
    try {
      await resolveErrorLog(errorId);
      setErrors((prev) => prev.map((e) => (e.id === errorId ? { ...e, status: "resolved" } : e)));
      toast.success("Marked resolved.");
    } catch {
      toast.error("Couldn't update this error.");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-muted2 bg-bg3 p-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={`rounded-full px-3 py-1 font-noto text-xs transition-colors ${
                status === opt.value ? "bg-clay text-ivory" : "text-muted hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-base w-auto text-xs" />
        <span className="font-noto text-xs text-muted">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-base w-auto text-xs" />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="font-noto text-sm text-muted">No errors match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-bg4">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-bg4 bg-bg2">
                {["Time", "Message", "Component", "User", "Status", ""].map((h) => (
                  <th key={h} className="p-3 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((err) => (
                <Fragment key={err.id}>
                  <tr className="border-b border-bg4 last:border-0">
                    <td className="whitespace-nowrap p-3 font-noto text-xs text-muted">{formatTime(err.createdAt)}</td>
                    <td className="max-w-[280px] truncate p-3 font-noto text-xs text-text">{err.message}</td>
                    <td className="p-3 font-noto text-xs text-muted">{err.component ?? (err.context?.operation as string) ?? "—"}</td>
                    <td className="p-3 font-noto text-[11px] text-muted">{err.uid ? err.uid.slice(0, 8) : "—"}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 font-noto text-[10px] font-semibold ${err.status === "open" ? "bg-clay/15 text-clay2" : "bg-green/15 text-green2"}`}>
                        {err.status}
                      </span>
                    </td>
                    <td className="flex items-center justify-end gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                        aria-label="Toggle stack trace"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg3"
                      >
                        {expandedId === err.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {err.status === "open" && (
                        <button
                          type="button"
                          onClick={() => handleResolve(err.id)}
                          disabled={resolvingId === err.id}
                          className="btn-ghost text-xs disabled:opacity-50"
                        >
                          {resolvingId === err.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark Resolved"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === err.id && (
                    <tr className="border-b border-bg4 bg-bg/60 last:border-0">
                      <td colSpan={6} className="p-3">
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg p-3 font-mono text-[11px] text-muted">
                          {err.stack ?? "No stack trace recorded."}
                        </pre>
                        {err.context && (
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg p-3 font-mono text-[11px] text-muted">
                            {JSON.stringify(err.context, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
