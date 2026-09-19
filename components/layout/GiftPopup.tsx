"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";

const CONFETTI_COLORS = ["#c4622d", "#e07840", "#d4a843", "#f0c96a", "#3d6b4f", "#4e8a64", "#9ecfef", "#f5ede0"];

/** One-time gift popup: if the signed-in account has a `pendingGift` on its profile (an emoji + a
 * "From ..." line, set by an admin), it shows once — big emoji, confetti, the message — and is then
 * cleared so it never appears again. Beta feedback: "For the user who requested ice cream... next
 * time she logs in, it should show a popup of an icecream with confetti, and say 'From Zamy'."
 * Generic on purpose: any future surprise is just a `pendingGift` field, no new code. */
export default function GiftPopup() {
  const { user, profile } = useAuth();
  const gift = profile?.pendingGift;
  const [dismissed, setDismissed] = useState(false);

  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.4 + Math.random() * 2,
        size: 6 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 720 - 360,
        round: i % 3 === 0,
      })),
    []
  );

  // Reset if a different gift arrives later in the same session.
  useEffect(() => {
    setDismissed(false);
  }, [gift?.emoji, gift?.message]);

  async function handleClose() {
    setDismissed(true);
    if (!user) return;
    // Clearing it is what makes this "once" — best-effort; if it fails the popup simply shows again
    // next load rather than ever being lost.
    await updateDoc(doc(db, "users", user.uid), { pendingGift: deleteField() }).catch(() => {});
  }

  const open = !!gift && !dismissed;

  return (
    <AnimatePresence>
      {open && gift && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-label="A gift for you"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {pieces.map((p) => (
              <motion.span
                key={p.id}
                initial={{ y: -40, opacity: 1, rotate: 0 }}
                animate={{ y: "105vh", opacity: [1, 1, 0.9], rotate: p.rotate }}
                transition={{ duration: p.duration, delay: p.delay, ease: "easeIn", repeat: Infinity, repeatDelay: 0.4 }}
                style={{ left: `${p.left}%`, width: p.size, height: p.size * (p.round ? 1 : 1.6), background: p.color, borderRadius: p.round ? "9999px" : 2 }}
                className="absolute top-0"
              />
            ))}
          </div>

          <motion.div
            initial={{ scale: 0.6, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="glass relative flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl p-8 text-center"
          >
            <motion.span
              animate={{ rotate: [-8, 8, -8], scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="text-8xl"
            >
              {gift.emoji}
            </motion.span>
            <p className="font-cinzel text-xl text-gold">{gift.title ?? "You got a gift!"}</p>
            <p className="font-noto text-base text-text">{gift.message}</p>
            <button type="button" onClick={handleClose} className="btn-primary mt-3 px-8">
              Aww, thanks 💛
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
