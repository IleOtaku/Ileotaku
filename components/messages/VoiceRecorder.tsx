"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import toast from "react-hot-toast";
import { Mic, Send, Trash2 } from "lucide-react";

/** Voice-note length limits: 1 min 30 s for everyone, 10 minutes for Platinum. */
export const VOICE_MAX_SECONDS_FREE = 90;
export const VOICE_MAX_SECONDS_PLATINUM = 600;

export interface VoiceRecorderProps {
  /** Hard cap on one recording — see VOICE_MAX_SECONDS_FREE / _PLATINUM. Auto-stops and sends at
   * this point rather than recording past the account's tier limit. */
  maxSeconds: number;
  onSend: (blob: Blob, durationSeconds: number) => void;
}

const CANCEL_THRESHOLD_PX = 80;
/** A press shorter than this is a tap, not a hold — it keeps recording "locked" with explicit
 * Send/Cancel buttons instead of sending on release. Makes 10-minute Platinum notes practical
 * (nobody holds a button for ten minutes) and also covers the very first press, where the
 * browser's microphone-permission prompt swallows the pointer release. */
const TAP_LOCK_MS = 500;
/** Warn (bar turns red, "Ns remaining") once this few seconds are left. */
const WARNING_SECONDS = 10;
/** Recordings shorter than this are discarded as accidental. */
const MIN_SECONDS = 1;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

/** "m:ss" — used for the limit, e.g. "1:30". */
function formatShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "mm:ss" — the running "● REC 00:42" clock. */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** DM voice messages: press and hold the mic to record, release to send, slide left to cancel —
 * or just tap it to record hands-free and use the Send/Trash buttons.
 *
 * Bugs this replaces (beta feedback: "voice notes stop too early" and "timer shows 00:00"):
 * - The duration handed to `onSend` was read from a stale render's `seconds` state (always 0, since
 *   `recorder.onstop` closed over the value from when recording began), so every sent voice message
 *   showed 0:00. Duration now comes from the wall clock (Date.now() - startedAt) via a ref, which is
 *   also immune to the browser throttling setInterval in a background tab.
 * - Releasing was tracked with `onMouseUp`/`onMouseLeave` on the recording bar that REPLACED the
 *   mic button under the pointer — so drifting off the bar ended the recording, and on touch devices
 *   `touchend` fires on the original (now unmounted) button and never reached the bar at all. Release
 *   and drag are now tracked with window-level pointer listeners, independent of what's mounted.
 * - The Blob was always labelled `audio/webm` even when the browser (Safari) had actually recorded
 *   MP4/AAC; it now uses the recorder's real mime type.
 * - `stopRecording()` was called from inside a setState updater (a side effect in a pure function,
 *   run twice in StrictMode); the auto-stop now runs from the interval itself. */
export default function VoiceRecorder({ maxSeconds, onSend }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const startXRef = useRef(0);
  const pointerDownAtRef = useRef(0);
  const pointerHeldRef = useRef(false);
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const shouldSendRef = useRef(false);
  const durationRef = useRef(0);
  const listenersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);
  const onSendRef = useRef(onSend);
  const maxSecondsRef = useRef(maxSeconds);
  onSendRef.current = onSend;
  maxSecondsRef.current = maxSeconds;

  const removeWindowListeners = useCallback(() => {
    const l = listenersRef.current;
    if (!l) return;
    window.removeEventListener("pointermove", l.move);
    window.removeEventListener("pointerup", l.up);
    window.removeEventListener("pointercancel", l.up);
    listenersRef.current = null;
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Ends the recording. `send` false discards it. Safe to call repeatedly. */
  const finish = useCallback(
    (send: boolean) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      removeWindowListeners();
      pointerHeldRef.current = false;

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        durationRef.current = Math.min(
          Math.round((Date.now() - startedAtRef.current) / 1000),
          maxSecondsRef.current
        );
        shouldSendRef.current = send && !cancelledRef.current;
        try {
          recorder.stop(); // flushes the last chunk, then fires onstop below
        } catch {
          releaseMic();
        }
      } else if (!recorder) {
        releaseMic();
      }
      setRecording(false);
      setLocked(false);
      setCancelling(false);
      lockedRef.current = false;
    },
    [releaseMic, removeWindowListeners]
  );

  // Unmounting mid-recording (the composer closing voice mode, a conversation switch) discards it
  // and — importantly — releases the microphone.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      removeWindowListeners();
      shouldSendRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // already stopping
        }
      }
      releaseMic();
    };
  }, [releaseMic, removeWindowListeners]);

  function handlePointerMove(e: PointerEvent) {
    if (!pointerHeldRef.current || lockedRef.current) return;
    const shouldCancel = startXRef.current - e.clientX > CANCEL_THRESHOLD_PX;
    cancelledRef.current = shouldCancel;
    setCancelling(shouldCancel);
  }

  function handlePointerUp() {
    pointerHeldRef.current = false;
    // Released before the recorder even existed (mic permission prompt still up): recording will
    // start locked as soon as getUserMedia resolves — see startRecording.
    if (!recorderRef.current) return;
    const heldMs = Date.now() - pointerDownAtRef.current;
    if (heldMs < TAP_LOCK_MS && !cancelledRef.current) {
      removeWindowListeners();
      lockedRef.current = true;
      setLocked(true);
      return;
    }
    finish(!cancelledRef.current);
  }

  async function startRecording(e: ReactPointerEvent) {
    if (recording || starting) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice messages aren't supported in this browser.");
      return;
    }

    startXRef.current = e.clientX;
    pointerDownAtRef.current = Date.now();
    pointerHeldRef.current = true;
    cancelledRef.current = false;
    lockedRef.current = false;

    const move = (ev: PointerEvent) => handlePointerMove(ev);
    const up = () => handlePointerUp();
    listenersRef.current = { move, up };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    setStarting(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error) {
      console.error("[voice] Microphone access failed:", error);
      removeWindowListeners();
      pointerHeldRef.current = false;
      setStarting(false);
      toast.error("Could not access your microphone. Check your browser's permission settings.");
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      });
    } catch (error) {
      console.error("[voice] MediaRecorder failed:", error);
      removeWindowListeners();
      releaseMic();
      pointerHeldRef.current = false;
      setStarting(false);
      toast.error("Couldn't start recording on this device.");
      return;
    }

    chunksRef.current = [];
    shouldSendRef.current = false;
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onerror = () => {
      toast.error("Recording was interrupted.");
      finish(false);
    };
    recorder.onstop = () => {
      releaseMic();
      // A quick second press can already have started a NEW recorder by the time this old one's
      // onstop fires — only clear the ref if it's still pointing at this one.
      if (recorderRef.current === recorder) recorderRef.current = null;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      if (!shouldSendRef.current) return;
      if (durationRef.current < MIN_SECONDS) {
        toast("Tap and hold the mic to record.");
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (blob.size > 0) onSendRef.current(blob, durationRef.current);
    };

    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    // A timeslice makes the browser emit a chunk every 250 ms instead of buffering the whole
    // recording until stop() — a crash or a dropped tab keeps everything captured so far.
    recorder.start(250);
    setStarting(false);
    setRecording(true);

    // The pointer was already released while the permission prompt was up: keep recording, locked.
    if (!pointerHeldRef.current) {
      removeWindowListeners();
      lockedRef.current = true;
      setLocked(true);
    }

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const limitMs = maxSecondsRef.current * 1000;
      if (elapsed >= limitMs) {
        setElapsedMs(limitMs);
        finish(true); // hit the tier limit: stop and send what we have
        return;
      }
      setElapsedMs(elapsed);
    }, 200);
  }

  if (recording) {
    const elapsedSec = elapsedMs / 1000;
    const remaining = Math.max(0, Math.ceil(maxSeconds - elapsedSec));
    const warning = remaining <= WARNING_SECONDS;
    const pct = Math.min(100, (elapsedMs / (maxSeconds * 1000)) * 100);

    return (
      <div className="flex flex-1 items-center gap-2">
        {locked && (
          <button
            type="button"
            onClick={() => finish(false)}
            aria-label="Discard recording"
            className="btn-ghost shrink-0 px-2.5"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl bg-bg3 px-4 py-2">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 shrink-0 animate-pulse rounded-full ${warning ? "bg-red-500" : "bg-clay2"}`} />
            <span className="font-noto text-[10px] font-bold uppercase tracking-wider text-muted">REC</span>
            <span className="font-noto text-sm font-semibold tabular-nums text-text">{formatClock(elapsedSec)}</span>
            <span className="font-noto text-xs tabular-nums text-muted">/ {formatShort(maxSeconds)}</span>
            <span
              className={`ml-auto flex items-center gap-1.5 truncate font-noto text-xs ${
                warning ? "font-semibold text-red-400" : cancelling ? "text-clay2" : "text-muted"
              }`}
            >
              {warning ? (
                `${remaining}s remaining`
              ) : locked ? (
                "Recording…"
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  {cancelling ? "Release to cancel" : "Slide left to cancel"}
                </>
              )}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={maxSeconds}
            aria-valuenow={Math.floor(elapsedSec)}
            className="h-[3px] w-full overflow-hidden rounded-full bg-bg5"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-linear ${warning ? "bg-red-500" : "bg-clay"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {locked && (
          <button
            type="button"
            onClick={() => finish(true)}
            aria-label="Send voice message"
            className="btn-primary shrink-0 px-3"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={startRecording}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Hold to record a voice message, or tap to record hands-free"
      className="btn-ghost shrink-0 touch-none select-none px-2.5 [-webkit-touch-callout:none]"
    >
      {starting ? <Mic className="h-4 w-4 animate-pulse text-clay2" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
