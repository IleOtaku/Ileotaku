"use client";

import { AlertCircle, File as FileIcon, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { formatDuration, seededWaveform } from "@/lib/voiceRecorder";

export interface PendingSend {
  id: string;
  /** Only shown in the conversation it belongs to. */
  conversationId: string;
  kind: "voice" | "image" | "video" | "file";
  status: "uploading" | "failed";
  percent: number;
  /** Object URL of the local media (image, or video for its first frame). */
  previewUrl?: string;
  fileName?: string;
  duration?: number;
  waveform?: number[];
  /** Photos in this send (for "3 photos"). */
  count?: number;
  retry: () => void;
  discard: () => void;
}

/** What the sender sees the instant they hit Send, until the upload finishes and the real message
 * arrives from Firestore: their own bubble with "Sending... 45%". A failed upload turns into a
 * "Couldn't send — Retry / Delete" bubble instead of silently vanishing. */
export default function PendingBubble({ send }: { send: PendingSend }) {
  const failed = send.status === "failed";
  const label = failed ? "Couldn't send" : `Sending... ${Math.round(send.percent)}%`;

  return (
    <div className="flex items-end justify-end gap-2" data-testid="pending-bubble" data-status={send.status}>
      <div className="flex max-w-[75%] flex-col items-end">
        <div className={`relative w-full rounded-2xl rounded-br-sm px-4 py-2 font-noto text-sm text-ivory ${failed ? "bg-red-900/60" : "bg-clay"}`}>
          {send.kind === "voice" && (
            <div className="flex min-w-[200px] items-center gap-2.5 opacity-80">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ivory/20">
                {failed ? <AlertCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              </span>
              <div className="flex h-7 flex-1 items-center gap-[2px]">
                {(send.waveform && send.waveform.length > 0 ? send.waveform : seededWaveform(send.duration ?? 7, 36)).map((h, i, arr) => (
                  <span
                    key={i}
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ height: `${h}%`, background: i / arr.length <= send.percent / 100 ? "#f5ede0" : "rgba(245,237,224,0.35)" }}
                  />
                ))}
              </div>
              <span className="shrink-0 font-mono text-[10px] tabular-nums">{formatDuration(send.duration ?? 0)}</span>
            </div>
          )}

          {(send.kind === "image" || send.kind === "video") && (
            <div className="relative mb-1 -mx-2 -mt-1 overflow-hidden rounded-xl bg-black/30" style={{ width: 200, height: 200 }}>
              {send.previewUrl &&
                (send.kind === "video" ? (
                  <video src={send.previewUrl} muted playsInline className="h-full w-full object-cover opacity-60" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={send.previewUrl} alt="" className="h-full w-full object-cover opacity-60" />
                ))}
              <span className="absolute inset-0 flex items-center justify-center">
                {failed ? <AlertCircle className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
              </span>
              {(send.count ?? 1) > 1 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 font-noto text-[10px]">{send.count} photos</span>
              )}
            </div>
          )}

          {send.kind === "file" && (
            <div className="flex items-center gap-2.5 opacity-90">
              <FileIcon className="h-6 w-6 shrink-0" />
              <p className="min-w-0 max-w-[200px] truncate font-noto text-xs font-semibold">{send.fileName ?? "File"}</p>
            </div>
          )}

          <p className="mt-1 flex items-center gap-1.5 font-noto text-[11px] opacity-90" data-testid="pending-label">
            {label}
          </p>
          {!failed && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/25">
              <div className="h-full rounded-full bg-ivory transition-all" style={{ width: `${Math.max(3, send.percent)}%` }} />
            </div>
          )}
        </div>
        {failed && (
          <div className="mt-1 flex items-center gap-3 font-noto text-xs">
            <button type="button" onClick={send.retry} className="flex items-center gap-1 font-semibold text-clay2 hover:underline">
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
            <button type="button" onClick={send.discard} className="flex items-center gap-1 text-muted hover:text-red-400">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
