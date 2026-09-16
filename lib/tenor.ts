/** DM Feature Overhaul (Part A): Tenor GIF search for the DM composer's GIF picker. Uses Tenor's
 * public v2 search API directly from the client — no server round-trip needed, same as how this
 * app already calls other public third-party APIs (manga sources) straight from the browser. */

export interface TenorGif {
  id: string;
  /** A modestly-sized preview GIF for the results grid. */
  previewUrl: string;
  /** The full-quality GIF actually sent/rendered in the chat. */
  fullUrl: string;
  width: number;
  height: number;
  description: string;
}

const TENOR_API_KEY = process.env.NEXT_PUBLIC_TENOR_API_KEY;
const TENOR_BASE = "https://tenor.googleapis.com/v2";

interface TenorMediaFormat {
  url: string;
  dims: [number, number];
}

interface TenorResult {
  id: string;
  content_description: string;
  media_formats: {
    gif?: TenorMediaFormat;
    tinygif?: TenorMediaFormat;
    nanogif?: TenorMediaFormat;
  };
}

function mapResult(r: TenorResult): TenorGif | null {
  const full = r.media_formats.gif;
  const preview = r.media_formats.tinygif ?? r.media_formats.nanogif ?? full;
  if (!full || !preview) return null;
  return {
    id: r.id,
    previewUrl: preview.url,
    fullUrl: full.url,
    width: full.dims[0],
    height: full.dims[1],
    description: r.content_description,
  };
}

export async function searchGifs(query: string, limit = 20): Promise<TenorGif[]> {
  if (!TENOR_API_KEY) return [];
  const trimmed = query.trim();
  const endpoint = trimmed
    ? `${TENOR_BASE}/search?q=${encodeURIComponent(trimmed)}&key=${TENOR_API_KEY}&limit=${limit}&media_filter=gif,tinygif,nanogif`
    : `${TENOR_BASE}/featured?key=${TENOR_API_KEY}&limit=${limit}&media_filter=gif,tinygif,nanogif`;
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.results ?? []) as TenorResult[];
    return results.map(mapResult).filter((g): g is TenorGif => g !== null);
  } catch {
    return [];
  }
}
