"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { PlatinumBadge } from "@/components/ui/Badges";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { Avatar } from "@/components/ui/Avatar";
import { useSearchPreview } from "@/hooks/useSearchPreview";
import { proxyImg } from "@/lib/manga-api";

export interface MobileNavSearchProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * The mobile-only search icon + its slide-down search bar, rendered next to the hamburger
 * button. Positioned as an absolute child of the sticky <header> (its nearest positioned
 * ancestor) so the panel spans the full navbar width rather than just this icon's box.
 */
export default function MobileNavSearch({ open, onOpen, onClose }: MobileNavSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const { mangaResults, peopleResults } = useSearchPreview(query);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  function goToSearch(peopleMode: boolean) {
    const term = query.trim().replace(/^@/, "");
    if (!term) return;
    onClose();
    router.push(`/search?q=${encodeURIComponent(term)}${peopleMode ? "&tab=people" : ""}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    goToSearch(query.trim().startsWith("@"));
  }

  const showDropdown = query.trim().length > 0 && (mangaResults.length > 0 || peopleResults.length > 0);

  // Beta feedback UI/UX: Navbar's own hamburger cluster now switches to the compact mobile
  // layout at lg (1024px) instead of md (768px) so tablets get it too — this self-gate has to
  // match, or the search icon (and NavSearch, which is lg:flex-gated already) would both be
  // hidden on tablet widths, leaving no way to search there at all.
  return (
    <div ref={containerRef} className="lg:hidden">
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-label={open ? "Close search" : "Search"}
        className="flex h-9 w-9 items-center justify-center rounded-full text-text/80 transition-colors hover:bg-bg3 hover:text-gold"
      >
        {open ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute inset-x-0 top-full z-50 overflow-hidden border-t border-bg4 bg-bg2 shadow-xl"
          >
            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search manga or @creator..."
                aria-label="Search manga or people"
                className="w-full min-w-0 flex-1 bg-transparent font-noto text-text placeholder:text-muted focus:outline-none"
                style={{ fontSize: "16px" }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg3 hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            {showDropdown && (
              <div className="max-h-[60vh] overflow-y-auto border-t border-bg4">
                {mangaResults.length > 0 && (
                  <div>
                    <p className="px-4 pb-1 pt-3 font-syne text-[10px] font-bold uppercase tracking-wide text-muted">
                      Manga
                    </p>
                    {mangaResults.map((m) => (
                      <Link
                        key={m.id}
                        href={`/manga/${encodeURIComponent(m.id)}?from=search`}
                        onClick={onClose}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg4"
                      >
                        <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-bg3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
            loading="lazy" src={proxyImg(m.image)} alt={m.title} className="h-full w-full object-cover" />
                        </div>
                        <span className="truncate font-noto text-sm text-text">{m.title}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {peopleResults.length > 0 && (
                  <div>
                    <p className="px-4 pb-1 pt-3 font-syne text-[10px] font-bold uppercase tracking-wide text-muted">
                      People
                    </p>
                    {peopleResults.map((p) => (
                      <Link
                        key={p.uid}
                        href={p.isCreator && p.handle ? `/creator/${p.handle}` : `/profile/${p.uid}`}
                        onClick={onClose}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg4"
                      >
                        <Avatar uid={p.uid} photoURL={p.photoURL} displayName={p.displayName} size={40} className="shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 font-noto text-sm text-text">
                            <span className="truncate">{p.displayName}</span>
                            <VerificationBadge user={p} size={12} />
                            <PlatinumBadge isPlatinum={p.isPlatinum} className="h-3 w-3" />
                          </span>
                          {p.handle && (
                            <span className="block truncate font-noto text-[10px] text-muted">@{p.handle}</span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    goToSearch(query.trim().startsWith("@") || peopleResults.length > mangaResults.length)
                  }
                  className="min-h-[44px] w-full border-t border-bg4 px-4 text-center font-syne text-xs font-semibold text-gold hover:bg-bg4"
                >
                  See all results
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
