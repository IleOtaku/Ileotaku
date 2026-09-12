"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Avatar, type AvatarProps } from "./Avatar";

/**
 * Drop-in replacement for `<Avatar>` on a profile header (own profile, public profile, creator
 * profile) that also makes the avatar tappable — opens a full-screen viewer of the real photo,
 * black background, tap anywhere or the X to close, fading in. Only actually opens anything when
 * there's a real `photoURL` to show; with no photo, this renders and behaves exactly like a plain
 * `<Avatar>` (there's no "full-size photo" behind an initials circle to view).
 *
 * `touch-action: pinch-zoom` on the full-size `<img>` lets a mobile browser's native pinch-to-zoom
 * gesture work on it — this component doesn't implement its own zoom/pan, it just gets out of the
 * way of the browser's built-in one (the default `touch-action: auto` DOES normally allow pinch
 * already, but this makes the intent explicit and protects it from an ancestor accidentally
 * setting `touch-action: none` / `manipulation` for swipe/scroll handling elsewhere on the page).
 */
export default function AvatarLightbox(props: AvatarProps) {
  const [open, setOpen] = useState(false);
  const canOpen = !!props.photoURL;

  return (
    <>
      <button
        type="button"
        onClick={() => canOpen && setOpen(true)}
        aria-label={canOpen ? "View full-size photo" : undefined}
        disabled={!canOpen}
        className="rounded-full disabled:cursor-default"
      >
        <Avatar {...props} />
      </button>

      <AnimatePresence>
        {open && canOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={props.photoURL}
              alt={props.displayName ?? "Profile photo"}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
              style={{ touchAction: "pinch-zoom" }}
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
