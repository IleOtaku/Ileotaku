"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { checkAllAPIs, getAPIHealth, type ApiHealthSnapshot, type ApiName } from "@/lib/manga-api";

const SOURCE_LABELS: Record<ApiName, string> = {
  mangadex: "MangaDex",
  comick: "Comick",
  mangahook: "MangaHook",
};

function statusOf(entry: ApiHealthSnapshot): "healthy" | "degraded" | "down" {
  if (!entry.healthy) return "down";
  if (entry.degraded) return "degraded";
  return "healthy";
}

const STATUS_DOT: Record<ReturnType<typeof statusOf>, string> = {
  healthy: "bg-green2",
  degraded: "bg-gold",
  down: "bg-clay2",
};

const STATUS_LABEL: Record<ReturnType<typeof statusOf>, string> = {
  healthy: "Healthy",
  degraded: "Degraded (slow)",
  down: "Down",
};

function formatTimestamp(ms: number | null): string {
  if (!ms) return "Never checked";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Live status of the three manga content sources, for the Technical admin dashboard.
 * Reads lib/manga-api's in-memory health tracker on mount, and can force a fresh round of
 * pings via "Check All APIs" — each source reports healthy/degraded/down, when it was last
 * checked, and its last measured response time. */
export default function ApiHealthMonitor() {
  const [snapshot, setSnapshot] = useState<ApiHealthSnapshot[]>(() => getAPIHealth());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setSnapshot(getAPIHealth());
  }, []);

  async function handleCheckAll() {
    setChecking(true);
    try {
      const result = await checkAllAPIs();
      setSnapshot(result);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-syne text-sm font-semibold text-text">Content API Health</h3>
        <button
          type="button"
          onClick={handleCheckAll}
          disabled={checking}
          className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking..." : "Check All APIs"}
        </button>
      </div>

      <div className="mt-4 flex flex-col divide-y divide-bg4">
        {snapshot.map((entry) => {
          const status = statusOf(entry);
          return (
            <div key={entry.name} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
                <div>
                  <p className="font-syne text-sm font-semibold text-text">{SOURCE_LABELS[entry.name]}</p>
                  <p className="font-noto text-xs text-muted">{STATUS_LABEL[status]}</p>
                </div>
              </div>
              <div className="text-right font-noto text-xs text-muted">
                <p>Last checked: {formatTimestamp(entry.lastCheck)}</p>
                <p>
                  {entry.lastResponseMs !== null ? `${entry.lastResponseMs}ms` : "—"}
                  {entry.lastError && (
                    <span className="ml-2 text-clay2" title={entry.lastError}>
                      {entry.lastError.slice(0, 40)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
