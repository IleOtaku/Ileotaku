import { useEffect, useState } from "react";
import { searchUsers } from "@/lib/firestore";
import { searchManga, type MangaListItem } from "@/lib/manga-api";
import type { UserProfile } from "@/types";

export interface SearchPreviewResult {
  mangaResults: MangaListItem[];
  peopleResults: UserProfile[];
}

/**
 * Debounced manga + people preview search, shared by the desktop NavSearch dropdown and the
 * mobile expanded search bar so both surfaces stay in sync with a single implementation.
 * A leading "@" on the query searches people only (skips the manga lookup) — the same
 * convention NavSearch has always used for handle search.
 */
export function useSearchPreview(query: string, maxEach = 3): SearchPreviewResult {
  const [mangaResults, setMangaResults] = useState<MangaListItem[]>([]);
  const [peopleResults, setPeopleResults] = useState<UserProfile[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setMangaResults([]);
      setPeopleResults([]);
      return;
    }
    const isHandleQuery = trimmed.startsWith("@");
    const term = trimmed.replace(/^@/, "");

    let cancelled = false;
    const handle = setTimeout(() => {
      Promise.all([
        isHandleQuery ? Promise.resolve<MangaListItem[]>([]) : searchManga(trimmed).then((res) => res.data.mangaList).catch(() => []),
        term ? searchUsers(term).catch(() => []) : Promise.resolve<UserProfile[]>([]),
      ]).then(([manga, people]) => {
        if (cancelled) return;
        setMangaResults(manga.slice(0, maxEach));
        setPeopleResults(people.slice(0, maxEach));
      });
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, maxEach]);

  return { mangaResults, peopleResults };
}
