"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import toast from "react-hot-toast";
import { computeWaveform, formatDuration, VoiceRecorder } from "@/lib/voiceRecorder";

export type VoiceNoteState = "idle" | "recording" | "preview";

export interface VoiceDraft {
  blob: Blob;
  /** Object URL for previewing the recording before it's sent — revoked by the hook. */
  url: string;
  seconds: number;
  waveform: number[];
}

/** Horizontal drag (px) that cancels a recording. */
export const CANCEL_SWIPE_PX = 80;
const LEVEL_BARS = 28;

/** Everything about the voice-note flow that isn't drawing: idle -> recording -> preview -> (send).
 *
 * - `startRecording` (mic pointerdown) starts the recorder. From then on the recording ends ONLY via
 *   `stopToPreview` (the Stop button), `cancelRecording`, a left swipe of 80px+, or the length limit —
 *   never by a pointer release, so lifting a finger can't cut a recording short.
 * - The swipe tracker works from the initial press AND from a fresh drag on the recording bar.
 * - Nothing here touches the network; `onSend` receives the finished draft and the caller uploads. */
export function useVoiceNote({ maxSeconds, onSend }: { maxSeconds: number; onSend: (draft: VoiceDraft) => void }) {
  const [state, setState] = useState<VoiceNoteState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BARS).fill(0));
  const [swipeDx, setSwipeDx] = useState(0);
  const [cancelledFlash, setCancelledFlash] = useState(false);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const stateRef = useRef<VoiceNoteState>("idle");
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const swipeCleanupRef = useRef<(() => void) | null>(null);
  const draftRef = useRef<VoiceDraft | null>(null);
  const onSendRef = useRef(onSend);
  const maxSecondsRef = useRef(maxSeconds);
  onSendRef.current = onSend;
  maxSecondsRef.current = maxSeconds;
  stateRef.current = state;
  draftRef.current = draft;

  const stopLevelTimer = useCallback(() => {
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    levelTimerRef.current = null;
  }, []);

  const endSwipeTracking = useCallback(() => {
    swipeCleanupRef.current?.();
    swipeCleanupRef.current = null;
    setSwipeDx(0);
  }, []);

  const revokeDraft = useCallback(() => {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
  }, []);

  const flashCancelled = useCallback(() => {
    setCancelledFlash(true);
    setTimeout(() => setCancelledFlash(false), 1400);
  }, []);

  const cancelRecording = useCallback(
    (flash = false) => {
      stopLevelTimer();
      endSwipeTracking();
      recorderRef.current?.cancel();
      recorderRef.current = null;
      setSeconds(0);
      setState("idle");
      if (flash) flashCancelled();
    },
    [stopLevelTimer, endSwipeTracking, flashCancelled]
  );

  /** Watches the pointer from `startX`; a drag of CANCEL_SWIPE_PX to the left cancels. Ends on release
   * — which never affects the recording itself. */
  const trackSwipe = useCallback(
    (startX: number) => {
      endSwipeTracking();
      const move = (e: PointerEvent) => {
        const dx = Math.max(0, startX - e.clientX);
        setSwipeDx(Math.min(dx, 160));
        if (dx > CANCEL_SWIPE_PX && stateRef.current === "recording") cancelRecording(true);
      };
      const up = () => endSwipeTracking();
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      swipeCleanupRef.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
    },
    [endSwipeTracking, cancelRecording]
  );

  const stopToPreview = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || stateRef.current !== "recording") return;
    stopLevelTimer();
    endSwipeTracking();
    const result = await recorder.stop();
    recorderRef.current = null;
    if (!result || result.durationSeconds < 1) {
      setState("idle");
      setSeconds(0);
      toast("Recording too short — tap the mic and speak, then tap stop.");
      return;
    }
    const url = URL.createObjectURL(result.blob);
    // Show the preview immediately; the real waveform fills in a moment later.
    const base: VoiceDraft = { blob: result.blob, url, seconds: result.durationSeconds, waveform: [] };
    setDraft(base);
    setState("preview");
    computeWaveform(result.blob).then((waveform) => setDraft((d) => (d && d.url === url ? { ...d, waveform } : d)));
  }, [stopLevelTimer, endSwipeTracking]);

  const startRecording = useCallback(
    async (e: ReactPointerEvent) => {
      if (stateRef.current !== "idle") return;
      const startX = e.clientX;
      setSeconds(0);
      setLevels(Array(LEVEL_BARS).fill(0));
      const recorder = new VoiceRecorder();
      recorderRef.current = recorder;
      // The finger/mouse is down right now: a drag left from here cancels, exactly like WhatsApp.
      trackSwipe(startX);
      try {
        await recorder.start(
          (s) => setSeconds(s),
          () => {
            toast(`Reached the ${formatDuration(maxSecondsRef.current)} limit — review it and send.`);
            void stopToPreview();
          },
          maxSecondsRef.current
        );
      } catch (error) {
        console.error("[voice] couldn't start recording:", error);
        recorderRef.current = null;
        endSwipeTracking();
        const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
        toast.error(denied ? "Please enable microphone access in your browser settings." : error instanceof Error ? error.message : "Couldn't start recording.");
        return;
      }
      // A swipe-cancel (or unmount) may have happened while the permission prompt was up.
      if (recorderRef.current !== recorder) {
        recorder.cancel();
        return;
      }
      setState("recording");
      stopLevelTimer();
      levelTimerRef.current = setInterval(() => {
        const level = recorder.getLevel();
        setLevels((prev) => [...prev.slice(1), level]);
      }, 70);
    },
    [trackSwipe, stopToPreview, endSwipeTracking, stopLevelTimer]
  );

  const discardDraft = useCallback(() => {
    revokeDraft();
    setDraft(null);
    setState("idle");
    setSeconds(0);
  }, [revokeDraft]);

  const sendDraft = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;
    // Ownership of the object URL passes to the caller's pending bubble; don't revoke here.
    onSendRef.current(current);
    setDraft(null);
    setState("idle");
    setSeconds(0);
  }, []);

  // Leaving the conversation mid-recording discards it and — importantly — releases the microphone.
  useEffect(() => {
    return () => {
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
      swipeCleanupRef.current?.();
      recorderRef.current?.cancel();
      if (draftRef.current) URL.revokeObjectURL(draftRef.current.url);
    };
  }, []);

  return {
    state,
    seconds,
    levels,
    swipeDx,
    cancelledFlash,
    draft,
    maxSeconds,
    startRecording,
    stopToPreview,
    cancelRecording: () => cancelRecording(false),
    beginBarSwipe: (e: ReactPointerEvent) => trackSwipe(e.clientX),
    discardDraft,
    sendDraft,
  };
}
