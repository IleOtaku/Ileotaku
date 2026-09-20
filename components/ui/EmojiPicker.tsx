"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Beta feedback: "Please add more emojis... especially the dark smiling moon emoji, add a whole lot of them, infact
 * all of them." The picker used to be a fixed row of 12. This is the whole Unicode emoji set (lib/emojiData.json,
 * generated from Unicode's own emoji-test.txt: ~1,900 emoji plus skin-tone variants — 🌚 included), with:
 *  - search by name ("moon", "dark moon", "party"),
 *  - category tabs and a Recent tab (the last 32 you used, remembered on this device),
 *  - a skin-tone chooser for the emoji that have tones,
 *  - and it only shows emoji THIS device can actually draw: a brand-new emoji on an older phone would otherwise
 *    appear as an empty box, so newer ones are test-rendered on a canvas first and hidden if they'd come out as tofu.
 *
 * The data is ~85 KB, so it's loaded only when the picker opens.
 */
type Entry = [char: string, name: string, version: number, tones?: string[]];
interface Data {
  groups: { id: string; label: string; emojis: Entry[] }[];
}

const RECENT_KEY = "ileotaku-recent-emojis";
const TONE_KEY = "ileotaku-emoji-tone";
const MAX_RECENT = 32;

const GROUP_ICONS: Record<string, string> = {
  Smileys: "😀",
  People: "👋",
  "Animals & Nature": "🐻",
  "Food & Drink": "🍔",
  "Travel & Places": "✈️",
  Activities: "⚽",
  Objects: "💡",
  Symbols: "❤️",
  Flags: "🏁",
};
const TONE_SWATCHES = ["👋", "👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"]; // index 0 = default (no tone)

/** Extra words people actually search for, beyond Unicode's own names. */
const ALIASES: Record<string, string> = {
  "🌚": "dark moon smiling moon black moon sus evil moon",
  "🌝": "smiling moon bright moon",
  "😂": "lol laugh crying laughing",
  "🤣": "rofl lmao",
  "😭": "sob crying loud",
  "🔥": "fire lit hot",
  "❤️": "love heart",
  "💀": "dead skull",
  "🙏": "pray thanks please",
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. — recents just won't persist */
  }
}

/** Would this device draw `emoji` properly? Emoji from before 2020 are assumed fine everywhere; newer ones are
 * drawn on a small canvas and compared with how the browser draws a character it has no glyph for. ZWJ sequences the
 * device doesn't know come out as several separate glyphs, so they're caught by width instead. */
function makeSupportCheck(): (emoji: string, version: number) => boolean {
  const canvas = document.createElement("canvas");
  const size = 28;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return () => true;
  ctx.font = `${size - 8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textBaseline = "top";
  const key = (s: string) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillText(s, 0, 0);
    const d = ctx.getImageData(0, 0, size, size).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) | 0;
    return h;
  };
  const unit = ctx.measureText("😀").width || size;
  const tofu = key("\u{10FFFE}");
  const cache = new Map<string, boolean>();
  return (emoji, version) => {
    if (version < 13) return true;
    const cached = cache.get(emoji);
    if (cached !== undefined) return cached;
    let ok = true;
    if (ctx.measureText(emoji).width > unit * 1.6) ok = false; // fell apart into pieces
    else if (key(emoji) === tofu) ok = false; // no glyph at all
    cache.set(emoji, ok);
    return ok;
  };
}

export interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  className?: string;
}

export default function EmojiPicker({ onPick, className }: EmojiPickerProps) {
  const [data, setData] = useState<Data | null>(null);
  const [supported, setSupported] = useState<((e: string, v: number) => boolean) | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>("Smileys");
  const [tone, setTone] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [toneOpen, setToneOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/emojiData.json").then((m) => {
      if (!cancelled) setData((m.default ?? m) as unknown as Data);
    });
    setSupported(() => makeSupportCheck());
    const r = readJSON<string[]>(RECENT_KEY, []);
    setRecent(r);
    setTone(readJSON<number>(TONE_KEY, 0));
    if (r.length > 0) setTab("Recent");
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => (data ? data.groups.flatMap((g) => g.emojis) : []), [data]);

  const shown = useMemo(() => {
    if (!data || !supported) return [] as Entry[];
    const ok = (e: Entry) => supported(e[0], e[2]);
    const q = query.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      return all.filter((e) => {
        if (!ok(e)) return false;
        const hay = `${e[1]} ${ALIASES[e[0]] ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    if (tab === "Recent") {
      const byChar = new Map<string, Entry>();
      all.forEach((e) => {
        byChar.set(e[0], e);
        e[3]?.forEach((t) => byChar.set(t, e));
      });
      return recent.map((c) => byChar.get(c) ?? ([c, c, 1] as Entry));
    }
    return (data.groups.find((g) => g.id === tab)?.emojis ?? []).filter(ok);
  }, [data, supported, all, query, tab, recent]);

  function pick(entry: Entry) {
    const char = tone > 0 && entry[3]?.[tone - 1] ? entry[3][tone - 1] : entry[0];
    const next = [char, ...recent.filter((c) => c !== char)].slice(0, MAX_RECENT);
    setRecent(next);
    writeJSON(RECENT_KEY, next);
    onPick(char);
  }

  function chooseTone(t: number) {
    setTone(t);
    writeJSON(TONE_KEY, t);
    setToneOpen(false);
  }

  return (
    <div className={cn("flex h-72 w-full flex-col overflow-hidden rounded-xl border border-bg4 bg-bg2", className)} data-testid="emoji-picker">
      <div className="flex items-center gap-2 border-b border-bg4 p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji (try “moon”)"
            aria-label="Search emoji"
            data-testid="emoji-search"
            className="input-base w-full py-1.5 pl-8 text-xs"
          />
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setToneOpen((o) => !o)}
            aria-label="Skin tone"
            data-testid="emoji-tone"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg3 text-lg hover:bg-bg4"
          >
            {TONE_SWATCHES[tone]}
          </button>
          {toneOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 flex gap-1 rounded-lg border border-bg4 bg-bg3 p-1.5 shadow-xl">
              {TONE_SWATCHES.map((s, i) => (
                <button key={i} type="button" onClick={() => chooseTone(i)} aria-label={`Skin tone ${i}`} className={cn("rounded-md p-1 text-lg hover:bg-bg4", tone === i && "bg-bg4")}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!query.trim() && (
        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-bg4 px-1.5 py-1" role="tablist">
          {recent.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "Recent"}
              aria-label="Recent"
              onClick={() => setTab("Recent")}
              className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg4", tab === "Recent" && "bg-bg4 text-text")}
            >
              <Clock className="h-4 w-4" />
            </button>
          )}
          {(data?.groups ?? []).map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={tab === g.id}
              aria-label={g.label}
              title={g.label}
              onClick={() => setTab(g.id)}
              className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-bg4", tab === g.id && "bg-bg4")}
            >
              {GROUP_ICONS[g.id] ?? "•"}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!data || !supported ? (
          <p className="p-4 text-center font-noto text-xs text-muted">Loading emoji…</p>
        ) : shown.length === 0 ? (
          <p className="p-4 text-center font-noto text-xs text-muted">{query.trim() ? "No emoji found." : "Nothing here yet — the emoji you use will show up here."}</p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {shown.map((e) => (
              <button
                key={e[0]}
                type="button"
                onClick={() => pick(e)}
                title={e[1]}
                aria-label={e[1]}
                data-testid="emoji-btn"
                data-emoji={e[0]}
                className="flex h-9 w-full items-center justify-center rounded-lg text-2xl leading-none hover:bg-bg4"
              >
                {tone > 0 && e[3]?.[tone - 1] ? e[3][tone - 1] : e[0]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
