"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { getOwnedPacksWithStickers, getSavedStickers } from "@/lib/stickers";
import type { StickerItem, StickerPack } from "@/types";

export interface StickerPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (stickerUrl: string) => void;
}

type PickerTab = "recent" | string; // "recent", or a pack id

/**
 * PART 6 — Sticker packs. Replaces the earlier curated-emoji-glyph picker with a real, owned-
 * pack-based one: a "Recently Used" tab (actually "recently saved" — see lib/stickers.ts's
 * saveSticker doc comment) plus one tab per pack the signed-in user owns, a keyword search across
 * every owned sticker at once, and a "Get More Stickers" link out to the Sticker Store for anyone
 * whose owned packs don't have what they're looking for.
 */
export default function StickerPicker({ open, onClose, onSelect }: StickerPickerProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<PickerTab>("recent");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<{ id: string; url: string }[]>([]);
  const [ownedPacks, setOwnedPacks] = useState<{ pack: StickerPack; stickers: StickerItem[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    Promise.all([getSavedStickers(user.uid), getOwnedPacksWithStickers(user.uid)]).then(([saved, owned]) => {
      setRecent(saved);
      setOwnedPacks(owned);
      setLoading(false);
      if (owned.length > 0 && saved.length === 0) setTab(owned[0].pack.id);
    });
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setTab("recent");
    }
  }, [open]);

  function handlePick(url: string) {
    onSelect(url);
    onClose();
  }

  const trimmedQuery = query.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;
  const searchResults = searching
    ? ownedPacks.flatMap(({ stickers }) => stickers.filter((s) => s.keywords.some((k) => k.toLowerCase().includes(trimmedQuery))))
    : [];

  const activeStickers: { id: string; url: string }[] = searching
    ? searchResults
    : tab === "recent"
      ? recent
      : ownedPacks.find(({ pack }) => pack.id === tab)?.stickers ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Send a Sticker">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your stickers..."
            className="input-base w-full pl-9"
          />
        </div>

        {!searching && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setTab("recent")}
              className={`shrink-0 rounded-full border px-3 py-1 font-noto text-xs font-semibold transition-colors ${
                tab === "recent" ? "border-clay bg-clay/15 text-clay2" : "border-muted2 text-muted hover:border-clay"
              }`}
            >
              Recently Used
            </button>
            {ownedPacks.map(({ pack }) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setTab(pack.id)}
                className={`shrink-0 rounded-full border px-3 py-1 font-noto text-xs font-semibold transition-colors ${
                  tab === pack.id ? "border-clay bg-clay/15 text-clay2" : "border-muted2 text-muted hover:border-clay"
                }`}
              >
                {pack.name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center font-noto text-sm text-muted">Loading your stickers...</p>
        ) : activeStickers.length === 0 ? (
          <p className="py-8 text-center font-noto text-sm text-muted">
            {searching
              ? "No matching stickers."
              : tab === "recent"
                ? "No recently used stickers — save one from a chat, or pick a pack above."
                : "This pack has no stickers."}
          </p>
        ) : (
          <div className="grid max-h-72 grid-cols-4 gap-3 overflow-y-auto sm:grid-cols-6">
            {activeStickers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handlePick(s.url)}
                className="flex aspect-square items-center justify-center rounded-xl bg-bg3 p-1.5 transition-transform hover:scale-110"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy" src={s.url} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}

        <Link
          href="/stickers"
          onClick={onClose}
          className="flex items-center justify-center gap-1.5 rounded-full border border-dashed border-muted2 py-2 font-noto text-xs font-semibold text-gold hover:border-clay"
        >
          <ShoppingBag className="h-3.5 w-3.5" /> Get More Stickers
        </Link>
      </div>
    </Modal>
  );
}
