"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";

export interface ChapterSelectSheetChapter {
  id: string;
  chapter: string;
}

export interface ChapterSelectSheetProps {
  open: boolean;
  onClose: () => void;
  chapters: ChapterSelectSheetChapter[];
  chapterIndex: number;
  onSelect: (idx: number) => void;
}

/**
 * Full-screen-height bottom sheet chapter picker for mobile, replacing the cramped native
 * <select> in ReaderToolbar with a scrollable list of large (56px) tap targets.
 */
export default function ChapterSelectSheet({
  open,
  onClose,
  chapters,
  chapterIndex,
  onSelect,
}: ChapterSelectSheetProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => activeRef.current?.scrollIntoView({ block: "center" }), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-end bg-black/70"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-bg4 bg-bg2"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-bg4 px-4 py-3">
              <h2 className="font-cinzel text-base text-gold">Chapters</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close chapter list"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-bg3 hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {chapters.length === 0 ? (
                <p className="px-3 py-6 text-center font-noto text-sm text-muted">
                  No chapters available yet.
                </p>
              ) : (
                chapters.map((c, i) => {
                  const active = i === chapterIndex;
                  return (
                    <button
                      key={c.id}
                      ref={active ? activeRef : undefined}
                      type="button"
                      onClick={() => {
                        onSelect(i);
                        onClose();
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 text-left transition-colors ${
                        active ? "bg-clay/20 text-clay2" : "text-text hover:bg-bg3"
                      }`}
                      style={{ minHeight: "56px" }}
                    >
                      <span className="truncate font-noto text-sm font-semibold">{c.chapter}</span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
