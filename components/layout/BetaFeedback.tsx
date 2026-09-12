"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { Bug, CheckCircle2, Lightbulb, Loader2, MessageCircle, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { createFeedback } from "@/lib/admin";
import { logError } from "@/lib/errorLogger";
import type { BetaFeedbackType } from "@/types";

const BETA_CUTOFF = new Date("2026-11-01");
const POSITION_KEY = "feedback-btn-position";
const BTN_SIZE = 56;
const EDGE_GAP = 12;
/** Below this many pixels of finger movement, a touch is still treated as a tap (opens the
 * modal) rather than a drag — mirrors StoryViewer's own long-press/swipe distinction. */
const DRAG_THRESHOLD = 6;

// Beta feedback UI/UX: "Everywhere that emoji were used instead of icons should be changed to
// icons" — these type-selector labels were structural chrome, not user content, so in scope.
const TYPES: { value: BetaFeedbackType; label: string; icon: LucideIcon }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "suggestion", label: "Suggestion", icon: Lightbulb },
  { value: "compliment", label: "Compliment", icon: ThumbsUp },
];

/** Floating "Feedback" pill, visible on every page during the beta window — opens a short modal
 * that writes straight to the betaFeedback collection (see lib/admin.ts's createFeedback and the
 * admin dashboards' Feedback tab, which triages what comes in). Auto-hides for good after the
 * beta window closes, no env var or flag needed to turn it off later. */
export default function BetaFeedback() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BetaFeedbackType | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Beta feedback: "draggable on mobile... stays within viewport bounds... snaps to nearest
  // edge... persists across page navigations via localStorage." `position` is null until the
  // button has actually been dragged at least once (or a saved drag is restored) — until then it
  // renders at its original fixed bottom-right spot via the existing Tailwind classes below,
  // exactly as before this feature existed. Touch events only ever fire from a real touchscreen
  // gesture, so this is naturally a no-op on a desktop mouse/trackpad without needing separate
  // device detection — "Desktop: stays fixed, not draggable" falls out of that for free.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; dragging: boolean } | null>(
    null
  );
  // Set true the instant a touch gesture crosses the drag threshold, read (and cleared) by
  // handleClick — a touchend/touchstart tap sequence also fires a synthetic click right after,
  // and this is what stops that synthetic click from also opening the feedback modal right as
  // the button is dropped.
  const justDraggedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) setPosition(JSON.parse(saved));
    } catch {
      // Best-effort — a corrupt/inaccessible localStorage value just means the button stays put.
    }
  }, []);

  function handleTouchStart(e: React.TouchEvent<HTMLButtonElement>) {
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: touch.clientX, startY: touch.clientY, origX: rect.left, origY: rect.top, dragging: false };
  }

  function handleTouchMove(e: React.TouchEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const touch = e.touches[0];
    const dx = touch.clientX - drag.startX;
    const dy = touch.clientY - drag.startY;
    if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.dragging = true;
    justDraggedRef.current = true;
    const x = Math.max(EDGE_GAP, Math.min(window.innerWidth - BTN_SIZE - EDGE_GAP, drag.origX + dx));
    const y = Math.max(EDGE_GAP, Math.min(window.innerHeight - BTN_SIZE - EDGE_GAP, drag.origY + dy));
    setPosition({ x, y });
  }

  function handleTouchEnd() {
    const drag = dragRef.current;
    if (!drag?.dragging) {
      dragRef.current = null;
      return;
    }
    setPosition((current) => {
      if (!current) return current;
      // Snap to whichever edge the button's center is closer to.
      const snapped = {
        x: current.x + BTN_SIZE / 2 < window.innerWidth / 2 ? EDGE_GAP : window.innerWidth - BTN_SIZE - EDGE_GAP,
        y: current.y,
      };
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify(snapped));
      } catch {
        // Best-effort — the button still ends up in the right place for this session either way.
      }
      return snapped;
    });
    dragRef.current = null;
  }

  function handleOpenClick() {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setOpen(true);
  }

  if (new Date() > BETA_CUTOFF) return null;

  function reset() {
    setType(null);
    setDescription("");
    setSubmitted(false);
  }

  function handleClose() {
    setOpen(false);
    // Wait out the modal's own close transition before wiping the form, so it doesn't visibly
    // reset itself while still fading out.
    setTimeout(reset, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || description.trim().length < 10) return;
    setSubmitting(true);
    try {
      await createFeedback({
        type,
        description: description.trim(),
        page: pathname ?? "/",
        uid: user?.uid ?? null,
        email: profile?.email ?? null,
      });
      setSubmitted(true);
      setTimeout(handleClose, 2000);
    } catch (error) {
      await logError(error, { operation: "BetaFeedback.handleSubmit" });
      toast.error("Couldn't submit your feedback. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpenClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={
          position
            ? "fixed z-40 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-clay to-gold px-4 py-2.5 font-syne text-sm font-bold text-ivory shadow-lg transition-transform hover:scale-105"
            : "fixed bottom-20 right-4 z-40 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-clay to-gold px-4 py-2.5 font-syne text-sm font-bold text-ivory shadow-lg transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
        }
        style={position ? { left: position.x, top: position.y } : undefined}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Modal open={open} onClose={handleClose} title="Beta Feedback">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green2" />
            <p className="font-noto text-sm text-text">
              Thank you! We read every piece of feedback. 🙏
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Type</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-noto text-xs font-semibold transition-colors ${
                      type === t.value
                        ? "border-clay bg-clay text-ivory"
                        : "border-muted2 bg-bg3 text-muted hover:text-text"
                    }`}
                  >
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 font-syne text-xs font-semibold text-muted">Description</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                required
                minLength={10}
                placeholder="Tell us what you found..."
                className="input-base resize-none text-sm"
              />
            </div>

            <p className="font-noto text-xs text-muted">Page: {pathname}</p>

            <button
              type="submit"
              disabled={submitting || !type || description.trim().length < 10}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Feedback
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
