import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side Spotify track search. Two auth modes, chosen by whether the request carries an
 * `Authorization: Bearer <token>` header (Sprint 9d's lib/spotify.ts's searchTracks() always
 * sends one, using the signed-in user's own OAuth access token — the client_secret is never
 * involved in that path at all, since the token was already minted by the token/refresh
 * routes):
 *   - With an Authorization header: that user token is forwarded to Spotify as-is.
 *   - Without one (SoundPicker's original, pre-9d Spotify tab, used when the visitor hasn't
 *     personally connected Spotify): falls back to this app's own Client Credentials grant, the
 *     only place SPOTIFY_CLIENT_SECRET is used — kept so track search still works for everyone,
 *     not only users who've completed the full per-user OAuth connection.
 *
 * force-dynamic + the explicit no-store response header below: without them a GET route like
 * this is a candidate for the browser's/Next's own caching by URL, and a transient failure
 * (e.g. one Spotify request momentarily erroring) gets remembered as if it were a stable
 * result — a second identical search then silently replays the same cached failure without
 * ever hitting the network again, which looks like "it's still broken" long after it isn't.
 */
export const dynamic = "force-dynamic";

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

interface SpotifyApiTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  duration_ms: number;
  preview_url: string | null;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q) {
    return NextResponse.json({ message: "Missing search query." }, { status: 400 });
  }

  const noStore = { "Cache-Control": "no-store" };

  const authHeader = request.headers.get("authorization");
  const userToken = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  const token = userToken ?? (await getAccessToken());
  if (!token) {
    return NextResponse.json(
      {
        message:
          "Spotify search isn't configured yet — add NEXT_PUBLIC_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env.local.",
      },
      { status: 501, headers: noStore }
    );
  }

  try {
    // limit=10: this app's Spotify developer tier (Development Mode, not yet granted Extended
    // Quota) rejects a track search with anything above 10 as "Invalid limit" even though the
    // general API docs say up to 50 — confirmed by testing 5/10/15/20/50 directly against the
    // real API with this app's own credentials. Applies to both auth modes — the limit is a
    // property of the app's own developer-tier grant, not of which token flavor is used.
    const res = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { message: `Spotify search request failed (${res.status}).`, detail: body.slice(0, 300) },
        { status: 502, headers: noStore }
      );
    }
    const data = (await res.json()) as { tracks?: { items: SpotifyApiTrack[] } };
    const tracks = (data.tracks?.items ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      albumArt: t.album.images[t.album.images.length - 1]?.url,
      duration: Math.round(t.duration_ms / 1000),
      previewUrl: t.preview_url,
    }));
    return NextResponse.json({ tracks }, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { message: "Spotify search request failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502, headers: noStore }
    );
  }
}
