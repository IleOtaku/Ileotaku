import { type ClassValue, clsx } from "clsx";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a date as a short relative time string, e.g. "3 hours ago". */
export function formatTime(date: string | number | Date): string {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "";
  }
}

/** Beta feedback: a feed post's timestamp should stay relative ("6 hours ago") while it's
 * recent, but switch to a plain calendar date once a post is a week or older — "3 months ago"
 * (formatTime's own, always-relative behavior) is vague and hard to place on a real timeline for
 * anything that old. Scoped to this one helper rather than changing formatTime() itself, which
 * 25+ other call sites (notifications, DMs, admin tables, ...) rely on staying purely relative. */
export function formatPostTimestamp(date: string | number | Date): string {
  try {
    const d = new Date(date);
    if (differenceInDays(Date.now(), d) >= 7) {
      return format(d, "dd-MM-yyyy");
    }
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * Formats a Naira amount with a "~$" USD equivalent alongside it, e.g. `formatDualPrice(1500, 0.99)`
 * -> "₦1,500 (~$0.99)". NGN is ÍléOtaku's real Paystack settlement currency; the USD figure is
 * display-only so international readers can gauge the cost at a glance.
 */
export function formatDualPrice(ngn: number, usd: number): string {
  const nairaPart = `₦${Math.round(ngn).toLocaleString("en-NG")}`;
  const usdPart = Number.isInteger(usd) ? usd.toString() : usd.toFixed(2);
  return `${nairaPart} (≈$${usdPart})`;
}

/** Deterministically derives an HSL color from a string, for avatar fallbacks. */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 42%)`;
}

/** Reduces a display name (or email) down to 1-2 uppercase initials. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Truncates text to a max length, appending an ellipsis when cut. */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}…`;
}

/** Where tapping a user's avatar or name should go — a creator's public page is keyed by their
 * @handle, everyone else's by uid. Takes a loose shape (rather than the full UserProfile) so it
 * also works from the partial, denormalized user info this app stores in other places — a DM
 * conversation's participantNames, a feed post's author fields, a search result — without
 * forcing every call site to first fetch a complete profile just to build a link. Falls back to
 * /profile/{uid} if a creator's handle is missing (shouldn't happen — creator signup requires
 * one — but a straight uid-keyed page still resolves rather than producing a broken /creator/
 * link with an empty segment). */
export function getUserProfileUrl(user: { uid: string; isCreator?: boolean; handle?: string }): string {
  if (user.isCreator && user.handle) return `/creator/${user.handle}`;
  return `/profile/${user.uid}`;
}

/** Parses view-count strings like "812K" or "1.2M" into a plain number for sorting/math. */
export function parseViewCount(view: string | undefined): number {
  if (!view) return 0;
  const match = /^([\d.]+)\s*([KMB])?$/i.exec(view.trim());
  if (!match) return Number(view.replace(/[^\d.]/g, "")) || 0;
  const [, numStr, suffix] = match;
  const num = Number(numStr) || 0;
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[suffix?.toUpperCase() ?? ""] ?? 1;
  return Math.round(num * multiplier);
}

/** Returns a time-of-day greeting ("Good morning" / "afternoon" / "evening") for the current hour. */
export function timeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export interface AfricanLanguage {
  code: string;
  name: string;
  native: string;
  region: string;
}

/** 30 African languages (plus the continent's major cross-border lingua francas) offered for localized reading. */
export const AFRICAN_LANGUAGES: AfricanLanguage[] = [
  { code: "sw", name: "Swahili", native: "Kiswahili", region: "East Africa" },
  { code: "am", name: "Amharic", native: "አማርኛ", region: "East Africa" },
  { code: "ha", name: "Hausa", native: "Hausa", region: "West Africa" },
  { code: "yo", name: "Yoruba", native: "Yorùbá", region: "West Africa" },
  { code: "ig", name: "Igbo", native: "Igbo", region: "West Africa" },
  { code: "zu", name: "Zulu", native: "isiZulu", region: "Southern Africa" },
  { code: "xh", name: "Xhosa", native: "isiXhosa", region: "Southern Africa" },
  { code: "af", name: "Afrikaans", native: "Afrikaans", region: "Southern Africa" },
  { code: "so", name: "Somali", native: "Soomaali", region: "East Africa" },
  { code: "om", name: "Oromo", native: "Afaan Oromoo", region: "East Africa" },
  { code: "sn", name: "Shona", native: "chiShona", region: "Southern Africa" },
  { code: "ak", name: "Akan (Twi)", native: "Akan", region: "West Africa" },
  { code: "wo", name: "Wolof", native: "Wolof", region: "West Africa" },
  { code: "ff", name: "Fula", native: "Fulfulde", region: "West Africa" },
  { code: "ln", name: "Lingala", native: "Lingála", region: "Central Africa" },
  { code: "rw", name: "Kinyarwanda", native: "Ikinyarwanda", region: "East Africa" },
  { code: "rn", name: "Kirundi", native: "Ikirundi", region: "East Africa" },
  { code: "ny", name: "Chichewa", native: "Chichewa", region: "Southern Africa" },
  { code: "mg", name: "Malagasy", native: "Malagasy", region: "East Africa" },
  { code: "ti", name: "Tigrinya", native: "ትግርኛ", region: "East Africa" },
  { code: "nd", name: "Ndebele", native: "isiNdebele", region: "Southern Africa" },
  { code: "st", name: "Sesotho", native: "Sesotho", region: "Southern Africa" },
  { code: "tn", name: "Setswana", native: "Setswana", region: "Southern Africa" },
  { code: "lg", name: "Luganda", native: "Luganda", region: "East Africa" },
  { code: "ki", name: "Kikuyu", native: "Gĩkũyũ", region: "East Africa" },
  { code: "bm", name: "Bambara", native: "Bamanankan", region: "West Africa" },
  { code: "ee", name: "Ewe", native: "Eʋegbe", region: "West Africa" },
  { code: "ber", name: "Tamazight", native: "Tamaziɣt", region: "North Africa" },
  { code: "ar", name: "Arabic", native: "العربية", region: "North Africa" },
  { code: "pt", name: "Portuguese", native: "Português", region: "Lusophone Africa" },
];

/** Genres used to tag and filter manga/comics across the catalog. */
export const GENRES: string[] = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Folklore",
  "Historical",
  "Horror",
  "Isekai",
  "Josei",
  "Martial Arts",
  "Mecha",
  "Mystery",
  "Mythology",
  "Psychological",
  "Romance",
  "School Life",
  "Sci-Fi",
  "Seinen",
  "Shoujo",
  "Shounen",
  "Slice of Life",
  "Sports",
  "Superhero",
  "Supernatural",
  "Thriller",
];
