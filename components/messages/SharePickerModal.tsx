"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Modal } from "@/components/ui";
import { getAllPublishedSeries } from "@/lib/publishedSeries";
import { getForYouFeed } from "@/lib/creatorFeed";
import { getVideoThumbnail } from "@/lib/cloudinary";
import type { CreatorPost, PublishedSeries } from "@/types";

export interface SharedManga {
  kind: "manga";
  id: string;
  title: string;
  coverURL: string;
}
export interface SharedPost {
  kind: "post";
  id: string;
  authorName: string;
  previewText: string;
  mediaUrl?: string;
}

export interface SharePickerModalProps {
  open: boolean;
  onClose: () => void;
  mode: "manga" | "post";
  onSelect: (item: SharedManga | SharedPost) => void;
}

/** DM Feature Overhaul (Part A): "📖 Share Manga" and "📤 Share Post" attachment options — one
 * shared modal, switched by `mode`. Manga search is a client-side title filter over the published
 * catalog (this app has no dedicated manga search index); the post picker shows a sample of the
 * live For You feed rather than a full search, since there's no post-search index either — tap
 * any result to share it. */
export default function SharePickerModal({ open, onClose, mode, onSelect }: SharePickerModalProps) {
  const [query, setQuery] = useState("");
  const [manga, setManga] = useState<PublishedSeries[]>([]);
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLoading(true);
    if (mode === "manga") {
      getAllPublishedSeries(200)
        .then(setManga)
        .finally(() => setLoading(false));
    } else {
      getForYouFeed(20, null)
        .then((page) => setPosts(page.posts))
        .finally(() => setLoading(false));
    }
  }, [open, mode]);

  const filteredManga = manga.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title={mode === "manga" ? "Share a Manga" : "Share a Post"}>
      <div className="flex flex-col gap-3">
        {mode === "manga" && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search manga titles..."
              className="input-base w-full pl-9"
            />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : mode === "manga" ? (
          filteredManga.length === 0 ? (
            <p className="py-10 text-center font-noto text-sm text-muted">No manga found.</p>
          ) : (
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {filteredManga.slice(0, 50).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect({ kind: "manga", id: m.id, title: m.title, coverURL: m.coverImage })}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bg4"
                >
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-bg3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" src={m.coverImage} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-syne text-sm font-semibold text-text">{m.title}</p>
                    <p className="truncate font-noto text-xs text-muted">{m.authorName}</p>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : posts.length === 0 ? (
          <p className="py-10 text-center font-noto text-sm text-muted">No posts to share right now.</p>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {posts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onSelect({
                    kind: "post",
                    id: p.id,
                    authorName: p.displayName,
                    previewText: p.content.slice(0, 80),
                    mediaUrl: p.attachments?.[0] ?? (p.videoUrl ? getVideoThumbnail(p.videoUrl) : undefined),
                  })
                }
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bg4"
              >
                {(p.attachments?.[0] ?? p.videoUrl) && (
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      loading="lazy"
                      src={p.attachments?.[0] ?? (p.videoUrl ? getVideoThumbnail(p.videoUrl) : undefined)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-syne text-sm font-semibold text-text">{p.displayName}</p>
                  <p className="truncate font-noto text-xs text-muted">{p.content.slice(0, 60) || "(no caption)"}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
