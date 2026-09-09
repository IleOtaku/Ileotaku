import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import type { SpotifyAuth } from "@/types";

const SPOTIFY_AUTH = "spotifyAuth";
const NOW_PLAYING = "nowPlaying";

/** Scopes needed for Now Playing (current + recently-played) — deliberately narrow: nothing
 * about playback control, library, or playlists, since this integration only ever reads what a
 * user is listening to. */
export const SPOTIFY_SCOPES =
  "user-read-currently-playing user-read-playback-state user-read-recently-played";

/** Redirects the browser to Spotify's consent screen. `state` carries the signed-in uid through
 * the round trip so the callback page knows whose spotifyAuth doc to write, the same way OAuth
 * `state` is conventionally used for CSRF-binding a callback to the request that started it.
 *
 * The two `process.env.NEXT_PUBLIC_*` reads below are deliberately written as literal static
 * property accesses rather than going through a `requireEnv(name)`-style helper indexing with
 * `process.env[name]` — Next.js inlines `NEXT_PUBLIC_*` vars into the client bundle at build
 * time via a webpack DefinePlugin pass that only rewrites exact `process.env.NEXT_PUBLIC_X`
 * expressions it can see statically; `process.env` itself is never shipped to the browser as a
 * real object, so any dynamic/bracket access to it silently evaluates to undefined at runtime
 * even though the same value works fine server-side (confirmed live: a `process.env[name]`
 * helper here made every "Connect Spotify" click throw "not set" despite .env.local being
 * correct and the dev server freshly restarted). */
export function connectSpotify(uid: string): void {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error(
      "Spotify isn't configured — add NEXT_PUBLIC_SPOTIFY_CLIENT_ID and NEXT_PUBLIC_SPOTIFY_REDIRECT_URI to .env.local."
    );
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state: uid,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Removes the OAuth grant and the last-known Now Playing snapshot. Leaves `spotifyConnected`
 * on the profile itself to the caller (SettingsTab flips it false in the same action) rather
 * than reaching into `users/{uid}` from here, since this module otherwise only ever touches its
 * own two subcollections. */
export async function disconnectSpotify(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "users", uid, SPOTIFY_AUTH, "default"));
    await deleteDoc(doc(db, "users", uid, NOW_PLAYING, "default"));
  } catch (error) {
    await logError(error, { operation: "spotify.disconnectSpotify", uid });
    throw error;
  }
}

function authDocRef(uid: string) {
  return doc(db, "users", uid, SPOTIFY_AUTH, "default");
}

function nowPlayingDocRef(uid: string) {
  return doc(db, "users", uid, NOW_PLAYING, "default");
}

/** Writes a fresh OAuth grant — called by the /auth/spotify/callback page right after the
 * server-side code-for-token exchange. */
export async function saveSpotifyAuth(
  uid: string,
  grant: { accessToken: string; refreshToken: string; expiresIn: number; spotifyUserId: string; spotifyDisplayName?: string }
): Promise<void> {
  const payload: SpotifyAuth = {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: Date.now() + grant.expiresIn * 1000,
    connectedAt: new Date().toISOString(),
    spotifyUserId: grant.spotifyUserId,
    ...(grant.spotifyDisplayName ? { spotifyDisplayName: grant.spotifyDisplayName } : {}),
  };
  await setDoc(authDocRef(uid), payload);
}

/** Just the display name (falling back to the raw Spotify user id) for the Settings tab's
 * "Connected as ..." line — doesn't go through getSpotifyAuth()'s refresh logic since it only
 * ever needs to display a name, not make an authenticated request with it. */
export async function getSpotifyDisplayName(uid: string): Promise<string | null> {
  try {
    const snap = await getDoc(authDocRef(uid));
    if (!snap.exists()) return null;
    const auth = snap.data() as SpotifyAuth;
    return auth.spotifyDisplayName || auth.spotifyUserId;
  } catch (error) {
    await logError(error, { operation: "spotify.getSpotifyDisplayName", uid });
    return null;
  }
}

/** Reads the stored OAuth grant, transparently refreshing it first if it's within 60s of
 * expiring (or already expired) — every other function in this file goes through this rather
 * than reading `accessToken` off the doc directly, so a caller never has to think about token
 * freshness itself. Returns null if the user has never connected Spotify, or if refreshing
 * fails (e.g. the grant was revoked on Spotify's side) — in the latter case the stale doc is
 * left in place rather than deleted, so a transient refresh failure doesn't silently disconnect
 * the user; disconnectSpotify() is still the only thing that removes the doc. */
export async function getSpotifyAuth(uid: string): Promise<string | null> {
  try {
    const snap = await getDoc(authDocRef(uid));
    if (!snap.exists()) return null;
    const auth = snap.data() as SpotifyAuth;

    if (auth.expiresAt > Date.now() + 60_000) {
      return auth.accessToken;
    }

    const res = await fetch("/api/spotify/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };

    await updateDoc(authDocRef(uid), {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    });
    return data.access_token;
  } catch (error) {
    await logError(error, { operation: "spotify.getSpotifyAuth", uid });
    return null;
  }
}

export interface CurrentlyPlayingTrack {
  trackName: string;
  artistName: string;
  albumArt: string;
  trackUrl: string;
  previewUrl: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
}

interface SpotifyCurrentlyPlayingResponse {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    name: string;
    artists: { name: string }[];
    album: { images: { url: string }[] };
    duration_ms: number;
    preview_url: string | null;
    external_urls: { spotify: string };
  } | null;
}

/** GET /v1/me/player/currently-playing. Spotify's own contract here is unusual: 204 No Content
 * (not a JSON body) means "nothing playing right now", and a 200 can still carry `item: null`
 * for the same reason (e.g. a private-session/podcast edge case) — both are treated as null. */
export async function getCurrentlyPlaying(uid: string): Promise<CurrentlyPlayingTrack | null> {
  const token = await getSpotifyAuth(uid);
  if (!token) return null;

  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 204 || !res.ok) return null;

    const data = (await res.json()) as SpotifyCurrentlyPlayingResponse;
    if (!data.item) return null;

    return {
      trackName: data.item.name,
      artistName: data.item.artists.map((a) => a.name).join(", "),
      albumArt: data.item.album.images[0]?.url ?? "",
      trackUrl: data.item.external_urls.spotify,
      previewUrl: data.item.preview_url,
      progressMs: data.progress_ms ?? 0,
      durationMs: data.item.duration_ms,
      isPlaying: data.is_playing,
    };
  } catch (error) {
    await logError(error, { operation: "spotify.getCurrentlyPlaying", uid });
    return null;
  }
}

export interface RecentlyPlayedTrack {
  trackName: string;
  artistName: string;
  albumArt: string;
  trackUrl: string;
  playedAt: string;
}

interface SpotifyRecentlyPlayedResponse {
  items: {
    track: {
      name: string;
      artists: { name: string }[];
      album: { images: { url: string }[] };
      external_urls: { spotify: string };
    };
    played_at: string;
  }[];
}

export async function getRecentlyPlayed(uid: string): Promise<RecentlyPlayedTrack | null> {
  const token = await getSpotifyAuth(uid);
  if (!token) return null;

  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as SpotifyRecentlyPlayedResponse;
    const last = data.items[0];
    if (!last) return null;

    return {
      trackName: last.track.name,
      artistName: last.track.artists.map((a) => a.name).join(", "),
      albumArt: last.track.album.images[0]?.url ?? "",
      trackUrl: last.track.external_urls.spotify,
      playedAt: last.played_at,
    };
  } catch (error) {
    await logError(error, { operation: "spotify.getRecentlyPlayed", uid });
    return null;
  }
}

export interface SpotifySearchTrack {
  id: string;
  name: string;
  artist: string;
  albumArt?: string;
  duration: number;
  previewUrl: string | null;
}

/** Searches tracks using `uid`'s own OAuth token via /api/spotify/search — same route
 * SoundPicker's non-connected fallback uses, just with an Authorization header attached so the
 * route forwards the user's token instead of falling back to app-level Client Credentials. */
export async function searchTracks(uid: string, query: string): Promise<SpotifySearchTrack[]> {
  const token = await getSpotifyAuth(uid);
  if (!token) return [];

  try {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { tracks?: SpotifySearchTrack[] };
    return data.tracks ?? [];
  } catch (error) {
    await logError(error, { operation: "spotify.searchTracks", uid });
    return [];
  }
}

/** Single-track preview lookup — used when a caller only has a trackId (e.g. from a deep link)
 * rather than a full search result already carrying `previewUrl`. */
export async function getTrackPreview(trackId: string, uid: string): Promise<string | null> {
  const token = await getSpotifyAuth(uid);
  if (!token) return null;

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { preview_url: string | null };
    return data.preview_url;
  } catch (error) {
    await logError(error, { operation: "spotify.getTrackPreview", uid, trackId });
    return null;
  }
}

/** Exposed only so lib/nowPlaying.ts writes to the exact same doc this module reads/refreshes
 * from — every other caller should go through the functions above instead. */
export { nowPlayingDocRef as _nowPlayingDocRef };
