"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";

export interface InAppCameraProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

/** DM Feature Overhaul (Part A): "📷 Camera" attachment option — a full-screen live camera view
 * (getUserMedia) with a shutter button that grabs the current frame via an off-screen canvas.
 * Front/back toggle for mobile; falls back to a clear error state (rather than a silent blank
 * screen) when the browser denies camera access or has none. */
export default function InAppCamera({ open, onClose, onCapture }: InAppCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function startCamera() {
      setError(null);
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setError("Couldn't access your camera — check your browser's camera permission.");
      }
    }
    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facingMode]);

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      onClose();
    }, "image/jpeg", 0.9);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <button type="button" onClick={onClose} aria-label="Close camera" className="text-white">
          <X className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
          aria-label="Flip camera"
          className="text-white"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        {error ? (
          <p className="max-w-xs text-center font-noto text-sm text-white/80">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
        )}
      </div>

      <div className="flex items-center justify-center p-6">
        <button
          type="button"
          onClick={handleCapture}
          disabled={!!error}
          aria-label="Take photo"
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
        >
          <Camera className="h-6 w-6 text-white" />
        </button>
      </div>
    </div>
  );
}
