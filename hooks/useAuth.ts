import { onAuthStateChanged, type User } from "firebase/auth";
import { create } from "zustand";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/firestore";
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

    if (user) {
      try {
        const profile = await getUserProfile(user.uid);
        setProfile(profile);
      } catch {
        setProfile(null);
      }
    } else {
      setProfile(null);
    }

    setLoading(false);
  });
}
