"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Modal } from "@/components/ui";
import { searchGifs, type TenorGif } from "@/lib/tenor";

export interface GifPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (gif: TenorGif) => void;
}

/** DM Feature Overhaul (Part A): search input + a grid of Tenor results, tap to send immediately
 * (no caption needed). Featured/trending GIFs show before the user types anything. */
export default function GifPicker({ open, onClose, onSelect }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const handle = setTimeout(() => {
      searchGifs(query, 20)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open]);

  return (
    <Modal open={open} onClose={onClose} title="Send a GIF">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Tenor..."
            className="input-base w-full pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : results.length === 0 ? (
          <p className="py-10 text-center font-noto text-sm text-muted">
            No GIFs found — try another search.
          </p>
        ) : (
          <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => {
                  onSelect(gif);
                  onClose();
                }}
                className="overflow-hidden rounded-lg bg-bg3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy" src={gif.previewUrl} alt={gif.description} className="h-24 w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
