import { onAuthStateChanged, type User } from "firebase/auth";
import { create } from "zustand";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/firestore";
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

/**
 * Starts the Firebase onAuthStateChanged listener exactly once, keeping the Zustand
 * store in sync and fetching the matching Firestore profile whenever a user signs in.
 * Called from AuthProvider so it only ever runs on the client.
 */
export function initAuthListener(): void {
  if (listenerStarted) return;
  listenerStarted = true;

  onAuthStateChanged(auth, async (user) => {
    const { setUser, setProfile, setLoading } = useAuth.getState();
    setUser(user);

    if (currentOnlineUid && currentOnlineUid !== user?.uid) {
      setOffline(currentOnlineUid);
      currentOnlineUid = null;
    }

    if (user) {
      try {
        const profile = await getUserProfile(user.uid);
        setProfile(profile);
      } catch {
        setProfile(null);
      }
      setOnline(user.uid);
      currentOnlineUid = user.uid;
    } else {
      setProfile(null);
    }

    setLoading(false);
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
