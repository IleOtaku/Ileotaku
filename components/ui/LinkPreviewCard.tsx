"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";

export interface LinkPreviewCardProps {
  url: string;
  className?: string;
}

interface PreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string;
}

// Module-level cache — the same link often appears in several messages/comments on screen at
// once (a shared invite, a repeated recommendation), and previews never change within a session,
// so there's no reason to refetch app/api/link-preview for a URL this tab has already resolved.
const cache = new Map<string, PreviewData | null>();

/** Beta feedback: "Links should be clickable, show the preview and should be formatted to be
 * shorter." The clickable+shortened link itself is MentionText's job; this renders the actual
 * preview card underneath it, fed by app/api/link-preview. Renders nothing at all — not even a
 * loading skeleton — when the fetch fails or the page has no usable Open Graph data, so a plain
 * link never grows an awkward empty box under it. */
export default function LinkPreviewCard({ url, className }: LinkPreviewCardProps) {
  const [data, setData] = useState<PreviewData | null | undefined>(cache.get(url));

  useEffect(() => {
    if (cache.has(url)) {
      setData(cache.get(url));
      return;
    }
    let cancelled = false;
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: PreviewData | null) => {
        if (cancelled) return;
        cache.set(url, json);
        setData(json);
      })
      .catch(() => {
        if (!cancelled) {
          cache.set(url, null);
          setData(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!data) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`flex items-center gap-2.5 overflow-hidden rounded-lg border border-bg4 bg-bg2 p-2 hover:border-muted2 ${className ?? ""}`}
    >
      {data.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" src={data.image} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-bg3 text-muted">
          <Link2 className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        {data.title && <span className="block truncate font-syne text-xs font-semibold text-text">{data.title}</span>}
        {data.description && (
          <span className="block truncate font-noto text-[11px] text-muted">{data.description}</span>
        )}
        <span className="block truncate font-noto text-[10px] text-muted/70">{data.siteName}</span>
      </span>
    </a>
  );
}
