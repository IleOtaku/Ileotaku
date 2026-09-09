"use client";

import { useState } from "react";
import Link from "next/link";
import { FALLBACK_SUMMARIES } from "@/lib/fallback-manga";
import { proxyImg } from "@/lib/manga-api";
import { GENRES } from "@/lib/utils";

const GENRE_EMOJIS: Record<string, string> = {
  Action: "⚔️",
  Adventure: "🗺️",
  Comedy: "😂",
  Drama: "🎭",
  Fantasy: "🐉",
  Folklore: "🪘",
  Historical: "🏛️",
  Horror: "👻",
  Isekai: "🌀",
  Josei: "🌸",
  "Martial Arts": "🥋",
  Mecha: "🤖",
  Mystery: "🔍",
  Mythology: "⚡",
  Psychological: "🧠",
  Romance: "💕",
  "School Life": "🎒",
  "Sci-Fi": "🚀",
  Seinen: "🗡️",
  Shoujo: "🌷",
  Shounen: "🔥",
  "Slice of Life": "🍵",
  Sports: "⚽",
  Superhero: "🦸",
  Supernatural: "👁️",
  Thriller: "🎯",
};

/** Genre chip grid — clicking a chip filters the catalog grid rendered directly below it. */
export default function GenreBrowser() {
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const filtered = activeGenre
    ? FALLBACK_SUMMARIES.filter((m) =>
        m.genres.some((g) => g.toLowerCase() === activeGenre.toLowerCase())
      )
    : FALLBACK_SUMMARIES;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-9">
        {GENRES.map((genre) => {
          const active = activeGenre === genre;
          return (
            <button
              key={genre}
              type="button"
              onClick={() => setActiveGenre(active ? null : genre)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors ${
                active ? "border-clay bg-clay/15" : "border-bg4 bg-bg2 hover:border-muted2"
              }`}
            >
              <span className="text-xl">{GENRE_EMOJIS[genre] ?? "📖"}</span>
              <span className={`font-noto text-[11px] ${active ? "text-clay2" : "text-muted"}`}>
                {genre}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {filtered.length === 0 ? (
          <p className="col-span-full font-noto text-sm text-muted">
            No titles in this genre yet — check back soon.
          </p>
        ) : (
          filtered.map((item) => (
            <Link
              key={item.id}
              href={`/manga/${encodeURIComponent(item.id)}`}
              className="group overflow-hidden rounded-xl border border-bg4 bg-bg2"
            >
              <div className="aspect-[3/4] overflow-hidden bg-bg3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
            loading="lazy"
                  src={proxyImg(item.image)}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <p className="truncate p-2 font-syne text-xs font-semibold text-text">{item.title}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
