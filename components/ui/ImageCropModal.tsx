"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2, ZoomIn, ZoomOut, X } from "lucide-react";

const MAX_ZOOM = 4;

export interface ImageCropModalProps {
  /** The picked image; the modal is open while this is non-null. */
  file: File | null;
  /** Width / height of the crop frame: 1 for an avatar, 3 for a wide banner. */
  aspect: number;
  /** "round" previews the crop as a circle (the saved image is still a plain rectangle). */
  shape?: "round" | "rect";
  /** Pixel width of the saved image (height follows `aspect`). */
  outputWidth: number;
  title: string;
  onCancel: () => void;
  onConfirm: (cropped: File) => void | Promise<void>;
}

/** Manual crop: drag the photo to position it, zoom with the slider / mouse wheel / pinch, and save exactly
 * what's inside the frame. Replaces "it auto-crops when I upload a profile picture" (beta feedback) —
 * the image is only ever cut the way the person chose, rendered to a JPEG on a canvas. */
export default function ImageCropModal({ file, aspect, shape = "rect", outputWidth, title, onCancel, onConfirm }: ImageCropModalProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [frameW, setFrameW] = useState(320);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const frameH = frameW / aspect;
  // "cover" fit at zoom 1: the image just fills the frame; zoom scales up from there.
  const baseScale = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const scale = baseScale * zoom;

  useEffect(() => {
    if (!file) {
      setSrc(null);
      setNatural(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setNatural(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The frame is as wide as fits (max 420px) — measured once the modal has laid out.
  useEffect(() => {
    if (!file) return;
    const measure = () => setFrameW(Math.min(420, Math.max(240, Math.min(window.innerWidth - 48, 420))));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onCancel, saving]);

  // Keep the photo covering the frame: it can be moved, never dragged off leaving an empty edge.
  function clamp(x: number, y: number, s: number) {
    if (!natural) return { x: 0, y: 0 };
    const maxX = Math.max(0, (natural.w * s - frameW) / 2);
    const maxY = Math.max(0, (natural.h * s - frameH) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }

  function setZoomClamped(z: number) {
    const next = Math.max(1, Math.min(MAX_ZOOM, z));
    setZoom(next);
    setOffset((o) => clamp(o.x, o.y, baseScale * next));
  }

  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 0) setZoomClamped(pinch.current.zoom * (d / pinch.current.dist));
      return;
    }
    setOffset((o) => clamp(o.x + (e.clientX - prev.x), o.y + (e.clientY - prev.y), scale));
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img || !natural || !file) return;
    setSaving(true);
    try {
      const outW = outputWidth;
      const outH = Math.round(outputWidth / aspect);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas isn't available.");
      // The frame's top-left corner, expressed in the original image's own pixels.
      const srcW = frameW / scale;
      const srcH = frameH / scale;
      const srcX = natural.w / 2 - (frameW / 2 + offset.x) / scale;
      const srcY = natural.h / 2 - (frameH / 2 + offset.y) / scale;
      ctx.fillStyle = "#0c0a07";
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("Couldn't render the crop.");
      const base = file.name.replace(/\.[^.]+$/, "") || "photo";
      await onConfirm(new File([blob], `${base}-cropped.jpg`, { type: "image/jpeg" }));
    } finally {
      setSaving(false);
    }
  }

  if (!file) return null;

  return createPortal(
    <div className="fixed inset-0 z-[320] flex flex-col items-center bg-black/90" role="dialog" aria-label={title}>
      <div className="flex w-full max-w-md items-center justify-between p-4 text-white">
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel" className="rounded-full p-1 hover:bg-white/10 disabled:opacity-40">
          <X className="h-6 w-6" />
        </button>
        <span className="font-syne font-semibold">{title}</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving || !natural}
          className="flex items-center gap-1.5 rounded-full bg-clay px-4 py-2 font-syne text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <div
          ref={frameRef}
          className={`relative overflow-hidden bg-black ring-2 ring-white/70 ${shape === "round" ? "rounded-full" : "rounded-xl"}`}
          style={{ width: frameW, height: frameH, touchAction: "none", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => setZoomClamped(zoom * Math.exp(-e.deltaY * 0.002))}
          data-testid="crop-frame"
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: natural ? natural.w * scale : undefined,
                height: natural ? natural.h * scale : undefined,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                visibility: natural ? "visible" : "hidden",
              }}
            />
          )}
          {!natural && <Loader2 className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/70" />}
        </div>

        <div className="flex w-full max-w-xs items-center gap-3 text-white/80">
          <ZoomOut className="h-4 w-4 shrink-0" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomClamped(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1 w-full cursor-pointer accent-[#c4622d]"
          />
          <ZoomIn className="h-4 w-4 shrink-0" />
        </div>
        <p className="font-noto text-xs text-white/50">Drag to reposition · pinch or use the slider to zoom</p>
      </div>
    </div>,
    document.body
  );
}
