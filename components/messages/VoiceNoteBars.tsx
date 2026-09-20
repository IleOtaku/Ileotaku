"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Mic, Pause, Play, Send, Square, Trash2, X } from "lucide-react";
import { formatDuration, seededWaveform } from "@/lib/voiceRecorder";
import type { VoiceDraft } from "@/hooks/useVoiceNote";

/** The mic button that sits in the message input row (next to the text field) whenever the field is
 * empty. Pressing it starts recording — there is no "hold": see hooks/useVoiceNote.ts. */
export function VoiceMicButton({ onPointerDown, disabled }: { onPointerDown: (e: ReactPointerEvent) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      aria-label="Record a voice message"
      className="btn-primary flex h-10 w-10 shrink-0 touch-none select-none items-center justify-center rounded-full p-0 [-webkit-touch-callout:none] disabled:opacity-40"
    >
      <Mic className="h-5 w-5" />
    </button>
  );
}

/** RECORDING state — replaces the whole input row: slide-to-cancel hint, live waveform, running timer,
 * a thin limit bar (turns red for the last 10 seconds) and the Stop button. */
export function VoiceRecordingBar({
  seconds,
  maxSeconds,
  levels,
  swipeDx,
  onStop,
  onCancel,
  onBarPointerDown,
}: {
  seconds: number;
  maxSeconds: number;
  levels: number[];
  swipeDx: number;
  onStop: () => void;
  onCancel: () => void;
  onBarPointerDown: (e: ReactPointerEvent) => void;
}) {
  const remaining = Math.max(0, maxSeconds - seconds);
  const warning = remaining <= 10;
  const pct = Math.min(100, (seconds / maxSeconds) * 100);
  // Drag left and the hint drifts the other way and fades, the way it does in WhatsApp/Telegram.
  const hintStyle = { transform: `translateX(${swipeDx * 0.5}px)`, opacity: Math.max(0.25, 1 - swipeDx / 90) };

  return (
    <div
      onPointerDown={onBarPointerDown}
      style={{ touchAction: "none" }}
      className="flex min-h-[52px] w-full select-none items-center gap-3 rounded-2xl bg-bg3 px-3 py-1.5"
      role="group"
      aria-label="Recording voice message"
    >
      <button type="button" onClick={onCancel} onPointerDown={(e) => e.stopPropagation()} aria-label="Cancel recording" className="shrink-0 text-muted hover:text-red-400">
        <Trash2 className="h-[18px] w-[18px]" />
      </button>

      {/* "0:42 / 1:30" — elapsed over THIS user's limit (1:30 free, 10:00 Platinum), with a small
          "Max 1:30" line under it that is always visible (the bar to the right is hidden on phones). */}
      <span className="flex shrink-0 flex-col items-start leading-tight">
        <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-clay2" data-testid="rec-timer">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          {formatDuration(seconds)}
          <span className="font-normal text-muted" data-testid="rec-limit">/ {formatDuration(maxSeconds)}</span>
        </span>
        <span
          data-testid="rec-max-label"
          className={`font-mono text-[10px] ${warning ? "font-bold text-red-400" : "text-muted"}`}
        >
          {warning ? `${remaining}s left` : `Max ${formatDuration(maxSeconds)}`}
        </span>
      </span>

      <div className="flex h-8 min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden" aria-hidden>
        {levels.map((l, i) => (
          <span
            key={i}
            className="w-1 shrink-0 rounded-full bg-clay"
            style={{ height: `${Math.max(12, Math.min(100, 12 + l * 110))}%`, transition: "height 70ms linear" }}
          />
        ))}
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={maxSeconds} aria-valuenow={seconds}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: warning ? "#ef4444" : "#c4622d" }} />
        </div>
      </div>

      <span className="shrink-0 whitespace-nowrap font-noto text-xs text-muted" style={hintStyle}>
        ← Slide to cancel
      </span>

      <button
        type="button"
        onClick={onStop}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Stop recording"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay text-white"
      >
        <Square className="h-4 w-4" fill="white" />
      </button>
    </div>
  );
}

/** PREVIEW state — the finished recording, playable before it's sent (or thrown away). */
export function VoicePreviewBar({ draft, onCancel, onSend }: { draft: VoiceDraft; onCancel: () => void; onSend: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    const audio = new Audio(draft.url);
    audioRef.current = audio;
    // MediaRecorder output has no duration header (audio.duration is Infinity), so progress is measured
    // against the length we measured ourselves.
    audio.addEventListener("timeupdate", () => setPosition(Math.min(audio.currentTime, draft.seconds)));
    audio.addEventListener("ended", () => {
      setPlaying(false);
      setPosition(0);
    });
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [draft.url, draft.seconds]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  const bars = draft.waveform.length > 0 ? draft.waveform : seededWaveform(draft.blob.size, 40);
  const progress = draft.seconds > 0 ? position / draft.seconds : 0;

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl bg-bg3 p-2.5" role="group" aria-label="Voice message preview">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay text-white"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <div className="flex h-8 min-w-0 flex-1 items-center gap-0.5" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-1 shrink-0 rounded-full transition-colors"
            style={{ height: `${h}%`, background: i / bars.length < progress ? "#c4622d" : "#7a6a58" }}
          />
        ))}
      </div>

      <span className="shrink-0 font-mono text-xs text-muted" data-testid="preview-duration">
        {formatDuration(playing ? position : draft.seconds)}
      </span>

      <button type="button" onClick={onCancel} aria-label="Discard voice message" className="shrink-0 text-muted hover:text-red-400">
        <X className="h-[18px] w-[18px]" />
      </button>

      <button type="button" onClick={onSend} aria-label="Send voice message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay text-white">
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
