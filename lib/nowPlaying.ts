import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { logError } from "./errorLogger";
import { db } from "./firebase";
import { _nowPlayingDocRef as nowPlayingRef, getCurrentlyPlaying, getRecentlyPlayed } from "./spotify";
import type { ListenSession, NowPlaying } from "@/types";

const LISTEN_SESSIONS = "listenSessions";

/** Fetches the user's current Spotify state and overwrites their `nowPlaying` doc with it —
 * either the currently-playing snapshot, or (when nothing's actively playing) their most
 * recently played track. Called on an interval by startNowPlayingSync(); never throws — a
 * failed sync tick just means the doc goes one tick stale, which the next tick fixes. */
export async function updateNowPlaying(uid: string): Promise<void> {
  try {
    const current = await getCurrentlyPlaying(uid);
    if (current && current.isPlaying) {
      const payload: NowPlaying = {
        isPlaying: true,
        trackName: current.trackName,
        artistName: current.artistName,
        albumArt: current.albumArt,
        trackUrl: current.trackUrl,
        previewUrl: current.previewUrl,
        progressMs: current.progressMs,
        durationMs: current.durationMs,
      };
      await setDoc(nowPlayingRef(uid), { ...payload, updatedAt: serverTimestamp() });
      return;
    }

    const recent = await getRecentlyPlayed(uid);
    const payload: NowPlaying = {
      isPlaying: false,
      ...(recent
        ? {
            lastTrackName: recent.trackName,
            lastArtistName: recent.artistName,
            lastAlbumArt: recent.albumArt,
            lastTrackUrl: recent.trackUrl,
            lastPlayedAt: recent.playedAt,
          }
        : {}),
    };
    await setDoc(nowPlayingRef(uid), { ...payload, updatedAt: serverTimestamp() });
  } catch (error) {
    await logError(error, { operation: "nowPlaying.updateNowPlaying", uid });
  }
}

/** One-shot read of a user's `nowPlaying` doc — used by SpotifyMiniPlayer (DM headers, comment
 * author rows, chat bubbles), which deliberately does NOT subscribe in real time: a chat/comment
 * list can render dozens of these at once, and a live listener per row is the kind of cost that
 * matters at that multiplicity in a way it doesn't for the single NowPlayingCard on a profile
 * page. */
export async function getNowPlayingOnce(uid: string): Promise<NowPlaying | null> {
  try {
    const snap = await getDoc(nowPlayingRef(uid));
    return snap.exists() ? (snap.data() as NowPlaying) : null;
  } catch (error) {
    await logError(error, { operation: "nowPlaying.getNowPlayingOnce", uid });
    return null;
  }
}

/** Real-time listener on one user's `nowPlaying` doc — used by NowPlayingCard (full mode, on
 * profile pages) so every viewer sees updates the instant a sync tick writes them, without
 * each viewer polling independently. */
export function subscribeToNowPlaying(
  uid: string,
  callback: (data: NowPlaying | null) => void
): Unsubscribe {
  return onSnapshot(
    nowPlayingRef(uid),
    (snap) => callback(snap.exists() ? (snap.data() as NowPlaying) : null),
    () => callback(null)
  );
}

/** Starts the periodic Now Playing sync for the *signed-in* user viewing their own profile —
 * calls updateNowPlaying() immediately (so the doc isn't stale for the whole first interval),
 * then every 30s after. Returns a cleanup function the caller's `useEffect` should return
 * directly, so the interval is always torn down when the profile unmounts or the viewer
 * navigates away. 30s (not faster) balances freshness against Spotify's own rate limits and
 * Firestore write costs — a currently-playing track's own progress bar is animated locally from
 * `progressMs`/`durationMs` between syncs rather than needing a tighter poll. */
export function startNowPlayingSync(uid: string): () => void {
  updateNowPlaying(uid);
  const interval = setInterval(() => updateNowPlaying(uid), 30_000);
  return () => clearInterval(interval);
}

function sessionRef(hostUid: string) {
  return doc(db, LISTEN_SESSIONS, hostUid);
}

/** Creates or joins a Listen Along session for `hostUid`'s currently-playing track — one
 * document per host, listeners tracked as a plain array rather than their own subdocuments
 * since the only thing anyone needs from this doc is "who's here right now". `setDoc` with
 * `merge: true` so a second listener joining doesn't clobber the first, and so re-joining after
 * a leave (or the host starting a new track) always leaves the doc in a consistent shape. */
export async function listenAlong(
  hostUid: string,
  listenerUid: string,
  previewUrl: string,
  trackName: string
): Promise<void> {
  try {
    // Not typed against ListenSession directly — arrayUnion()/serverTimestamp() are Firestore
    // write-time sentinels, not real string[]/string values, so they can only ever match that
    // read-side interface's shape once Firestore has actually resolved them server-side.
    await setDoc(
      sessionRef(hostUid),
      {
        hostUid,
        listeners: arrayUnion(listenerUid),
        previewUrl,
        trackName,
        startedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    await logError(error, { operation: "nowPlaying.listenAlong", hostUid, listenerUid });
    throw error;
  }
}

export async function leaveListenSession(hostUid: string, listenerUid: string): Promise<void> {
  try {
    await updateDoc(sessionRef(hostUid), { listeners: arrayRemove(listenerUid) });
  } catch (error) {
    // Non-fatal — leaving is a courtesy cleanup; the listener closing the panel is what
    // actually matters to them, and a stale roster entry self-corrects next time anyone
    // reads it against the host's now-possibly-different `isPlaying` state.
    await logError(error, { operation: "nowPlaying.leaveListenSession", hostUid, listenerUid });
  }
}

export function subscribeToListenSession(
  hostUid: string,
  callback: (session: ListenSession | null) => void
): Unsubscribe {
  return onSnapshot(
    sessionRef(hostUid),
    (snap) => callback(snap.exists() ? (snap.data() as ListenSession) : null),
    () => callback(null)
  );
}
