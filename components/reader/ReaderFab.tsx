"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BookMarked, Home, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { initials, stringToColor, truncate } from "@/lib/utils";

/** Floating quick-nav button for the mobile reader — avatar/Sign In pill, opens a small menu. */
export default function ReaderFab() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const readingProgress = profile?.readingProgress ?? {};
  const mostRecent = Object.entries(readingProgress).sort((a, b) =>
    (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? "")
  )[0];

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div ref={containerRef} className="fixed bottom-16 right-4 z-40 md:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="glass absolute bottom-14 right-0 w-52 overflow-hidden rounded-xl p-1.5"
          >
            <button
              type="button"
              onClick={() => go("/")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
            >
              <Home className="h-4 w-4" /> Home
            </button>

            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => go("/profile?tab=library")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                >
                  <BookMarked className="h-4 w-4" /> My Library
                </button>
                <button
                  type="button"
                  onClick={() => go("/profile")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                >
                  <UserIcon className="h-4 w-4" /> My Profile
                </button>
                {mostRecent && (
                  <button
                    type="button"
                    onClick={() =>
                      go(`/reader?id=${encodeURIComponent(mostRecent[0])}&chapter=${mostRecent[1].chapterIndex}`)
                    }
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
                  >
                    <BookMarked className="h-4 w-4 shrink-0 text-clay2" />
                    <span className="truncate">Continue: {truncate(mostRecent[1].title, 20)}</span>
                  </button>
                )}
              </>
            ) : (
              <Link
                href="/auth/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-noto text-sm text-text hover:bg-bg4"
              >
                <UserIcon className="h-4 w-4" /> Sign In
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick menu"
        className="flex h-12 items-center gap-2 rounded-full border border-muted2 bg-bg2/95 px-3 shadow-lg backdrop-blur"
      >
        {user ? (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full font-syne text-xs font-bold text-ivory"
            style={{ backgroundColor: stringToColor(profile?.displayName ?? user.displayName ?? "U") }}
          >
            {initials(profile?.displayName ?? user.displayName ?? "U")}
          </span>
        ) : (
          <span className="px-1 font-syne text-xs font-semibold text-text">Sign In</span>
        )}
      </button>
    </div>
  );
}
