import { onAuthStateChanged, type User } from "firebase/auth";
import { create } from "zustand";
import { auth } from "@/lib/firebase";
import { subscribeToUserProfile } from "@/lib/firestore";
import { setOffline, setOnline } from "@/lib/onlineStatus";
import type { UserProfile } from "@/types";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
}

/** Zustand store holding the current Firebase Auth user and their Firestore profile. */
export const useAuth = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
}));

let listenerStarted = false;
/** The uid lib/onlineStatus.ts currently considers "online" — tracked separately from the
 * store's `user` so a sign-out (or switching accounts in the same tab) can mark the PREVIOUS
 * uid offline before/regardless of whatever the new auth state turns out to be. */
let currentOnlineUid: string | null = null;
/** Unsubscribes the previous uid's profile listener before starting a new one — otherwise
 * switching accounts in the same tab (or a second onAuthStateChanged firing) would leak
 * listeners and let a stale one occasionally overwrite the current user's profile. */
let unsubscribeProfile: (() => void) | null = null;

/**
 * Starts the Firebase onAuthStateChanged listener exactly once, keeping the Zustand
 * store in sync and opening a REAL-TIME Firestore listener (subscribeToUserProfile) on the
 * signed-in user's own profile whenever one signs in — so every value the app reads off
 * `useAuth().profile` (coin balance, isPlatinum, follower counts, ...) updates live wherever
 * it's changed, not only on the specific actions that happen to call setProfile manually
 * afterward. Called from AuthProvider so it only ever runs on the client.
 */
export function initAuthListener(): void {
  if (listenerStarted) return;
  listenerStarted = true;

  onAuthStateChanged(auth, (user) => {
    const { setUser, setProfile, setLoading } = useAuth.getState();
    setUser(user);

    // Error log bug: "Missing or insufficient permissions" on onlineStatus.setOffline, on every
    // sign-out. This used to call setOffline(currentOnlineUid) reactively right here — but by the
    // time onAuthStateChanged fires with the new state, request.auth is already null (a real
    // sign-out) or a different uid (switching accounts), so firestore.rules' isOwner(uid) check
    // on the OLD uid can never pass; the write was structurally guaranteed to fail every time.
    // lib/auth.ts's logout() now marks presence offline proactively, before auth.currentUser
    // actually changes, while the write can still satisfy isOwner() — the only real path to
    // getting signed out in this app, so nothing is lost by not also trying (and failing) here.
    if (currentOnlineUid && currentOnlineUid !== user?.uid) {
      currentOnlineUid = null;
    }

    unsubscribeProfile?.();
    unsubscribeProfile = null;

    if (user) {
      unsubscribeProfile = subscribeToUserProfile(user.uid, (profile) => {
        setProfile(profile);
        setLoading(false);
      });
      setOnline(user.uid);
      currentOnlineUid = user.uid;
    } else {
      setProfile(null);
      setLoading(false);
    }
  });

  // Best-effort — an abrupt tab close/crash may still tear the page down before this async
  // write completes (see lib/onlineStatus.ts's STALE_AFTER_MS comment for why display logic
  // doesn't rely on it firing reliably), but a normal navigation-away or tab close usually
  // gives it enough time to go out.
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (currentOnlineUid) setOffline(currentOnlineUid);
    });
  }
}
