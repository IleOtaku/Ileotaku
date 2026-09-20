"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  children: ReactNode;
  content: string;
  /** Where it PREFERS to open. If that side doesn't have room in the viewport it flips to the opposite one. */
  position?: Side;
}

const GAP = 10; // space between the trigger and the tooltip
const MARGIN = 8; // minimum distance from the screen edge
const ARROW = 8;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/**
 * Beta feedback: "Upgrade tooltips. It shouldnt be the plain html tooltips. It should be unique, our colors plus
 * our logo icon, then the tooltip message." — the shared, branded tooltip (bg3/gold palette, small logo mark, a
 * real fade/scale-in via framer-motion).
 *
 * Beta feedback (bug): "When i hover on call for gc, something pops up but i can't see it cuz it's hidden... let it
 * pop up below the call not above... it's not just the group call button... different tooltips in active chat. a
 * z-index problem maybe." It was, but not only z-index. The tooltip used to be an absolutely positioned child of its
 * trigger, so it lived inside whatever containers the trigger lived in — and the chat column (and the message list,
 * and the header) are `overflow-hidden`/`overflow-y-auto`, which CLIP anything that pokes outside them no matter its
 * z-index; a tooltip opening upward from the header sits above the column's top edge and was cut off, and one on the
 * right-hand header buttons also ran off the edge of the screen.
 *
 * It's now rendered in a portal on <body> with `position: fixed`, so no ancestor can clip it or stack over it; it's
 * placed from the trigger's real on-screen rectangle, flips to the opposite side when the preferred one has no room,
 * and is clamped to stay fully inside the viewport (its arrow keeps pointing at the trigger).
 */
export function Tooltip({ children, content, position = "top" }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const [place, setPlace] = useState<{ x: number; y: number; side: Side; arrow: number } | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const room = {
      top: a.top - t.height - GAP >= MARGIN,
      bottom: a.bottom + t.height + GAP <= vh - MARGIN,
      left: a.left - t.width - GAP >= MARGIN,
      right: a.right + t.width + GAP <= vw - MARGIN,
    };
    const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
    const side: Side = !room[position] && room[opposite[position]] ? opposite[position] : position;

    let x: number;
    let y: number;
    let arrow: number;
    if (side === "top" || side === "bottom") {
      x = clamp(a.left + a.width / 2 - t.width / 2, MARGIN, vw - t.width - MARGIN);
      y = side === "top" ? a.top - t.height - GAP : a.bottom + GAP;
      arrow = clamp(a.left + a.width / 2 - x, ARROW + 4, t.width - ARROW - 4);
    } else {
      y = clamp(a.top + a.height / 2 - t.height / 2, MARGIN, vh - t.height - MARGIN);
      x = side === "left" ? a.left - t.width - GAP : a.right + GAP;
      arrow = clamp(a.top + a.height / 2 - y, ARROW + 4, t.height - ARROW - 4);
    }
    setPlace((prev) => (prev && prev.x === x && prev.y === y && prev.side === side && prev.arrow === arrow ? prev : { x, y, side, arrow }));
  }, [position]);

  // Measure right after it mounts (hidden, at 0,0) and place it before the first paint.
  useLayoutEffect(() => {
    if (show) reposition();
    else setPlace(null);
  }, [show, content, reposition]);

  // Keep it attached to the trigger if the page scrolls (any scroll container) or resizes while it's open.
  useEffect(() => {
    if (!show) return;
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [show, reposition]);

  const arrowStyle = (): React.CSSProperties => {
    if (!place) return {};
    switch (place.side) {
      case "top":
        return { bottom: -ARROW / 2 - 1, left: place.arrow - ARROW / 2, borderTopWidth: 0, borderLeftWidth: 0 };
      case "bottom":
        return { top: -ARROW / 2 - 1, left: place.arrow - ARROW / 2, borderBottomWidth: 0, borderRightWidth: 0 };
      case "left":
        return { right: -ARROW / 2 - 1, top: place.arrow - ARROW / 2, borderBottomWidth: 0, borderLeftWidth: 0 };
      case "right":
        return { left: -ARROW / 2 - 1, top: place.arrow - ARROW / 2, borderTopWidth: 0, borderRightWidth: 0 };
    }
  };

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {show && (
              <motion.span
                ref={tipRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                role="tooltip"
                data-side={place?.side}
                // z-[500]: above modals (200s), the gift popup (300) and everything else in the app.
                style={{ position: "fixed", left: place?.x ?? 0, top: place?.y ?? 0, visibility: place ? "visible" : "hidden" }}
                className={cn(
                  "glass pointer-events-none z-[500] flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-bg3 px-2.5 py-1.5 font-noto text-xs text-ivory shadow-lg"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/icon-32.png" alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" />
                {content}
                <span
                  className="absolute rotate-45 border border-white/10 bg-bg3"
                  style={{ width: ARROW, height: ARROW, ...arrowStyle() }}
                />
              </motion.span>
            )}
          </AnimatePresence>,
          document.body
        )}
    </span>
  );
}
