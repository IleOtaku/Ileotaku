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

    if (currentOnlineUid && currentOnlineUid !== user?.uid) {
      setOffline(currentOnlineUid);
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
