"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Trash2 } from "lucide-react";

export interface VoiceRecorderProps {
  /** 2 minutes for free accounts, 10 for Platinum — matches the feature spec's own limits. */
  maxSeconds: number;
  onSend: (blob: Blob, durationSeconds: number) => void;
}

const CANCEL_THRESHOLD_PX = 80;

/** DM Feature Overhaul (Part A): "🎤 Voice Message — hold to record, release to send... Swipe
 * left while holding to cancel recording." Replaces the normal composer row with a recording
 * indicator while the mic button is held; releasing within CANCEL_THRESHOLD_PX of the start point
 * sends, releasing further left cancels. Auto-stops (and sends whatever was captured) at
 * `maxSeconds` rather than recording forever past the account's tier limit. */
export default function VoiceRecorder({ maxSeconds, onSend }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startXRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording(clientX: number) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;
      startXRef.current = clientX;

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelledRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          onSend(blob, seconds);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      setCancelling(false);

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      // Permission denied or no mic — silently no-op, matching InAppCamera's own graceful
      // degradation rather than crashing the composer.
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function handleMove(clientX: number) {
    if (!recording) return;
    const delta = startXRef.current - clientX;
    const shouldCancel = delta > CANCEL_THRESHOLD_PX;
    cancelledRef.current = shouldCancel;
    setCancelling(shouldCancel);
  }

  if (recording) {
    return (
      <div
        className="flex flex-1 items-center gap-3 rounded-full bg-bg3 px-4 py-2.5"
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseUp={stopRecording}
        onMouseLeave={stopRecording}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={stopRecording}
      >
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-clay2" />
        <span className="font-noto text-sm text-text">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
        <span className={`flex flex-1 items-center justify-end gap-1.5 font-noto text-xs ${cancelling ? "text-clay2" : "text-muted"}`}>
          <Trash2 className="h-3.5 w-3.5" />
          {cancelling ? "Release to cancel" : "Slide left to cancel"}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onMouseDown={(e) => startRecording(e.clientX)}
      onTouchStart={(e) => startRecording(e.touches[0].clientX)}
      aria-label="Hold to record a voice message"
      className="btn-ghost shrink-0 px-2.5"
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
