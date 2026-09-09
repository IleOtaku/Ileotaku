"use client";

import { useEffect, useState } from "react";
import { getMangaDetail } from "@/lib/manga-api";

export interface MangaSummary {
  id: string;
  title: string;
  image: string;
}

/** Fetches title/cover for a list of manga ids client-side — used anywhere a bare id list
 * (e.g. a bookmarks array) needs to render as actual cover cards. */
export function useMangaSummaries(ids: string[]) {
  const [items, setItems] = useState<MangaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      ids.slice(0, 20).map(async (id) => {
        try {
          const res = await getMangaDetail(id);
          return { id, title: res.data.title, image: res.data.image };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setItems(results.filter((r): r is MangaSummary => r !== null));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return { items, loading };
}
