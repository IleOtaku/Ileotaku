"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { downloadMediaDirect } from "@/lib/videoDownload";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 300;
const SWIPE_PX = 70;

/** Fullscreen photo viewer for DMs: pinch to zoom, drag to pan while zoomed, double-tap (or
 * double-click) to zoom in/out, mouse-wheel / trackpad-pinch zoom, swipe left/right (or arrow keys)
 * between the photos of one message, swipe down or Esc to close. Gestures are hand-rolled on pointer
 * events (two pointers = pinch) so there's no dependency and it behaves the same on touch and mouse. */
export default function ImageViewer({ urls, startIndex = 0, onClose }: { urls: string[]; startIndex?: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const gestureStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const state = useRef({ scale: 1, tx: 0, ty: 0 });
  state.current = { scale, tx, ty };

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = i + delta;
        return next < 0 || next >= urls.length ? i : next;
      });
      reset();
    },
    [urls.length, reset]
  );

  // Pan can never drag the photo further than its zoomed edge.
  const clampPan = useCallback((x: number, y: number, s: number) => {
    const el = stageRef.current;
    if (!el || s <= 1) return { x: 0, y: 0 };
    const maxX = (el.clientWidth * (s - 1)) / 2;
    const maxY = (el.clientHeight * (s - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, []);

  const applyZoom = useCallback(
    (nextScale: number) => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      const { x, y } = clampPan(state.current.tx, state.current.ty, s);
      setScale(s);
      setTx(x);
      setTy(y);
    },
    [clampPan]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  function onPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: state.current.scale };
      gestureStart.current = null;
    } else if (pointers.current.size === 1) {
      gestureStart.current = { x: e.clientX, y: e.clientY, moved: false };
      setDragging(true);
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0) applyZoom(pinchStart.current.scale * (dist / pinchStart.current.dist));
      return;
    }
    if (state.current.scale > 1) {
      const next = clampPan(state.current.tx + (e.clientX - prev.x), state.current.ty + (e.clientY - prev.y), state.current.scale);
      setTx(next.x);
      setTy(next.y);
    }
    if (gestureStart.current && Math.hypot(e.clientX - gestureStart.current.x, e.clientY - gestureStart.current.y) > 8) {
      gestureStart.current.moved = true;
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    const start = gestureStart.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      setDragging(false);
      gestureStart.current = null;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!start.moved) {
          // A tap: double-tap toggles zoom.
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            if (state.current.scale > 1) reset();
            else applyZoom(2.5);
            lastTap.current = 0;
          } else {
            lastTap.current = now;
          }
        } else if (state.current.scale <= 1.02) {
          // Not zoomed: horizontal swipe changes photo, downward swipe closes.
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
          else if (dy > 110 && Math.abs(dy) > Math.abs(dx)) onClose();
        }
      }
    }
  }

  function onWheel(e: ReactWheelEvent) {
    // Proportional to the wheel delta: a mouse notch (~100) zooms ~28%, a trackpad pinch (arrives as a
    // wheel event with ctrlKey and tiny deltas) zooms smoothly.
    applyZoom(state.current.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)));
  }

  const viewer = (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/95" role="dialog" aria-label="Photo viewer">
      <div className="flex items-center justify-between p-3 text-white">
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
        {urls.length > 1 && <span className="font-noto text-sm tabular-nums">{index + 1} / {urls.length}</span>}
        <button
          type="button"
          onClick={() => void downloadMediaDirect(urls[index], `photo-${index + 1}.jpg`)}
          aria-label="Download photo"
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-noto text-xs hover:bg-white/20"
        >
          <Download className="h-4 w-4" /> Download
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none", cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={() => (state.current.scale > 1 ? reset() : applyZoom(2.5))}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={urls[index]}
          src={urls[index]}
          alt=""
          draggable={false}
          data-testid="viewer-image"
          data-scale={scale.toFixed(2)}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 180ms ease-out",
          }}
        />
        {urls.length > 1 && index > 0 && (
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:block">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {urls.length > 1 && index < urls.length - 1 && (
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:block">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      <p className="p-3 text-center font-noto text-[11px] text-white/50">Pinch or double-tap to zoom · swipe to browse</p>
    </div>
  );

  // Portal to <body>: an ancestor with transform/filter (the chat's glass panels) would otherwise
  // re-anchor `fixed` to itself instead of the viewport.
  return typeof document === "undefined" ? null : createPortal(viewer, document.body);
}
