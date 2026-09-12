"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PlatinumBadge, VerifiedBadge } from "@/components/ui/Badges";
import { Avatar } from "@/components/ui/Avatar";
import { useSearchPreview } from "@/hooks/useSearchPreview";
import { proxyImg } from "@/lib/manga-api";

/** Navbar search bar with a live quick-results dropdown: 3 manga + 3 people, "@" jumps to People. */
export default function NavSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { mangaResults, peopleResults } = useSearchPreview(query);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goToSearch(peopleMode: boolean) {
    setOpen(false);
    const term = query.trim().replace(/^@/, "");
    if (!term) return;
    router.push(`/search?q=${encodeURIComponent(term)}${peopleMode ? "&tab=people" : ""}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    goToSearch(query.trim().startsWith("@"));
  }

  function handleSeeAll() {
    // "People-heavy" last results: more people matches than manga ones, or the query was a
    // handle search to begin with.
    const peopleHeavy = query.trim().startsWith("@") || peopleResults.length > mangaResults.length;
    goToSearch(peopleHeavy);
  }

  const showDropdown = open && query.trim().length > 0 && (mangaResults.length > 0 || peopleResults.length > 0);

  return (
    <div className="relative mx-4 hidden max-w-xs flex-1 lg:flex" ref={containerRef}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search manga or @creator..."
            aria-label="Search manga or people"
            className="input-base py-1.5 pl-9 text-sm"
          />
        </div>
      </form>

      {showDropdown && (
        <div className="glass absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl">
          {mangaResults.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-3 font-syne text-[10px] font-bold uppercase tracking-wide text-muted">
                Manga
              </p>
              {mangaResults.map((m) => (
                <Link
                  key={m.id}
                  href={`/manga/${encodeURIComponent(m.id)}?from=search`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-bg4"
                >
                  <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-bg3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
            loading="lazy" src={proxyImg(m.image)} alt={m.title} className="h-full w-full object-cover" />
                  </div>
                  <span className="truncate font-noto text-xs text-text">{m.title}</span>
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
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-bg4"
                >
                  <Avatar uid={p.uid} photoURL={p.photoURL} displayName={p.displayName} size={40} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-noto text-xs text-text">
                      <span className="truncate">{p.displayName}</span>
                      <VerifiedBadge profile={p} className="h-3 w-3" />
                      <PlatinumBadge isPlatinum={p.isPlatinum} className="h-3 w-3" />
                    </span>
                    {p.handle && <span className="block truncate font-noto text-[10px] text-muted">@{p.handle}</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleSeeAll}
            className="w-full border-t border-bg4 px-4 py-2.5 text-center font-syne text-xs font-semibold text-gold hover:bg-bg4"
          >
            See all results
          </button>
        </div>
      )}
    </div>
  );
}
