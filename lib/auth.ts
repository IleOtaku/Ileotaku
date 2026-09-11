import { deleteUser } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type AuthError,
  type UserCredential,
} from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, limit, query, where, writeBatch } from "firebase/firestore";
import { appleProvider, auth, db, googleProvider, twitterProvider } from "./firebase";
import { logError } from "./errorLogger";
import { getUserProfile, updateLastActive, updateUserPrefs, upsertUserProfile } from "./firestore";

export type SocialProviderName = "google" | "apple" | "twitter";

/** Creates an email/password account, sets the Auth display name, and seeds the Firestore profile. */
export async function signUpEmail(
  name: string,
  email: string,
  password: string
): Promise<UserCredential> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await upsertUserProfile(cred.user.uid, {
    uid: cred.user.uid,
    displayName: name,
    email: cred.user.email ?? email,
    photoURL: cred.user.photoURL ?? "",
    role: "reader",
    tier: "free",
    coins: 0,
    favorites: [],
    following: [],
    followers: [],
    isCreator: false,
    isAdmin: false,
    isPlatinum: false,
  });
  return cred;
}

export async function signInEmail(email: string, password: string): Promise<UserCredential> {
  const cred = await signInWithEmailAndPassword(auth, email, password);

  // Backfills a profile a previous signup never finished writing (the tab closing, or a
  // network drop, between createUserWithEmailAndPassword and upsertUserProfile leaves the
  // Auth account signed-in-forever with no Firestore document at all) — confirmed live as the
  // root cause behind two separately-reported symptoms: feed posts failing for "a regular
  // user" (creatorFeed's create rule reads users/{uid} to check forYouEligible, which throws
  // outright when the document doesn't exist, not just a missing field) and a hard error
  // opening certain profiles. signInSocial already guards its existing-user branch the same
  // way; mirrored here since updateLastActive's updateDoc silently no-ops (catches and logs,
  // never rethrows) on a document that was never created, so nothing else would ever surface
  // this or self-heal it.
  const existing = await getUserProfile(cred.user.uid);
  if (existing) {
    await updateLastActive(cred.user.uid);
  } else {
    await upsertUserProfile(cred.user.uid, {
      uid: cred.user.uid,
      displayName: cred.user.displayName ?? "ÍléOtaku Fan",
      email: cred.user.email ?? email,
      photoURL: cred.user.photoURL ?? "",
      role: "reader",
      tier: "free",
      coins: 0,
      favorites: [],
      following: [],
      followers: [],
      isCreator: false,
      isAdmin: false,
      isPlatinum: false,
    });
  }
  return cred;
}

/** Signs in via Google, Apple or X (Twitter) popup and seeds/merges the Firestore profile. */
export async function signInSocial(providerName: SocialProviderName): Promise<UserCredential> {
  const provider =
    providerName === "google"
      ? googleProvider
      : providerName === "apple"
        ? appleProvider
        : twitterProvider;

  const cred = await signInWithPopup(auth, provider);

  // Only seed defaults on first sign-in — an existing profile's coins, role, follows and
  // flags must never be clobbered back to defaults on a returning user's later logins.
  const existing = await getUserProfile(cred.user.uid);
  if (existing) {
    await updateUserPrefs(cred.user.uid, {
      displayName: cred.user.displayName ?? existing.displayName,
      email: cred.user.email ?? existing.email,
      photoURL: cred.user.photoURL ?? existing.photoURL ?? "",
    });
  } else {
    await upsertUserProfile(cred.user.uid, {
      uid: cred.user.uid,
      displayName: cred.user.displayName ?? "ÍléOtaku Fan",
      email: cred.user.email ?? "",
      photoURL: cred.user.photoURL ?? "",
      role: "reader",
      tier: "free",
      coins: 0,
      favorites: [],
      following: [],
      followers: [],
      isCreator: false,
      isAdmin: false,
      isPlatinum: false,
    });
  }
  await updateLastActive(cred.user.uid);
  return cred;
}

export async function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export async function logout(): Promise<void> {
  return signOut(auth);
}

/** Every `users/{uid}/{name}` subcollection a full account deletion needs to empty first —
 * Firestore never cascades a subcollection delete from deleting its parent document, so each of
 * these has to be swept explicitly or it's simply orphaned (unreachable from the UI, but still
 * billed for and still real user data sitting in the database after "delete my account").
 *
 * `transactions` is deliberately NOT included: firestore.rules only lets an admin delete or
 * update a coin-ledger entry (by design — see that collection's own rule comment, "the ledger
 * is otherwise read-only from the client once written"), so a self-service delete would just
 * fail with permission-denied here. scripts/check-inactive-accounts.js's admin-SDK deletion path
 * does remove them, since it bypasses client rules entirely and there's no audit reason to keep
 * a ledger for an account nobody can look up anymore. */
const USER_SUBCOLLECTIONS = ["history", "unlocked", "notifications", "drafts", "spotifyAuth", "nowPlaying"];

/** Deletes every document in one collection, batching in chunks of 450 (comfortably under
 * Firestore's 500-writes-per-batch limit) and re-querying until it's empty — safe for a
 * collection of any size, not just the handful of rows a typical account actually has. */
async function deleteAllDocs(colRef: ReturnType<typeof collection>): Promise<void> {
  for (;;) {
    const snap = await getDocs(query(colRef, limit(450)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 450) return;
  }
}

/**
 * Full account deletion, called from the Settings tab's Danger Zone after the user has typed
 * "DELETE" to confirm. Order matters: subcollections and the creatorFeed posts are wiped while
 * the Firestore rules can still identify the requester as this account's owner (rules key off
 * `request.auth.uid`, which is still valid up until `deleteUser` actually revokes the session),
 * then the main profile document, and only then the Firebase Auth account itself — reversing
 * that order would leave a Firestore profile with no matching Auth user if any step failed
 * partway through, which is worse than the reverse (an Auth account with no Firestore data,
 * which the login flow already treats as "needs onboarding" and recreates cleanly).
 *
 * Firebase requires a recent sign-in for `deleteUser` — a stale session throws
 * `auth/requires-recent-login`. Unlike every step before it, this one is handled specially
 * rather than rethrown: by the time `deleteUser` runs, every Firestore trace of the account is
 * already gone — the only thing `auth/requires-recent-login` blocks is removing the now-empty
 * Auth record itself. Surfacing that as a scary "couldn't delete your account" error (confirmed
 * live: this is a real, reachable case, not a hypothetical — a session that's simply been open
 * a while is enough to trigger it) would be actively misleading, since retrying doesn't undo
 * the data loss and re-signing-in wouldn't even restore anything for an email/password account
 * (only signInSocial()'s upsert-if-missing recreates a profile; signInEmail() doesn't). So
 * instead this signs the (already dataless) session out and returns normally — from the user's
 * side, their account and data are gone either way, which is what actually matters; the orphan
 * Auth record with no matching profile is inert and harmless left behind.
 */
/** Whether the signed-in user has a password on file at all — social-only accounts (Google/
 * Apple/Twitter) can't reauthenticate with a password, so deleteMyAccount()'s pre-emptive reauth
 * step only applies when this is true. Used by SettingsTab's delete-confirmation modal to decide
 * whether to even show a password field. */
export function hasPasswordProvider(): boolean {
  return auth.currentUser?.providerData.some((p) => p.providerId === "password") ?? false;
}

export interface DeleteAccountResult {
  /** False when the Firebase Auth credential itself couldn't be removed (still needs a real
   * recent sign-in Firebase itself requires for this) even though every trace of the account's
   * data is already gone — see this function's own doc comment for why that split can happen. */
  authRemoved: boolean;
}

/**
 * Beta feedback / error-log bug: this used to always report success even when Firebase's
 * `deleteUser()` call failed with `auth/requires-recent-login` — the account's Firestore data was
 * genuinely gone, but the dangling Auth credential meant that email could never sign up again
 * ("email already in use") despite the app telling the user their account was fully deleted.
 *
 * The real fix is reauthenticating BEFORE destroying any data, not after: if `password` is
 * given (SettingsTab only asks for one when hasPasswordProvider() is true), this reauthenticates
 * first and throws immediately on a wrong password — before anything is deleted — rather than
 * discovering the credential can't be removed only after the data already is. A social-only
 * account (no password to offer) still falls back to the old "data gone, credential dangling"
 * path, now reported honestly via `authRemoved` instead of masked as a full success.
 */
export async function deleteMyAccount(uid: string, password?: string): Promise<DeleteAccountResult> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error("Not signed in.");

  if (password && user.email) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }

  try {
    await Promise.all(USER_SUBCOLLECTIONS.map((name) => deleteAllDocs(collection(db, "users", uid, name))));

    const postsSnap = await getDocs(query(collection(db, "creatorFeed"), where("uid", "==", uid)));
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, "users", uid));
  } catch (error) {
    await logError(error, { operation: "deleteMyAccount", uid });
    throw error;
  }

  try {
    await deleteUser(user);
    return { authRemoved: true };
  } catch (error) {
    if ((error as AuthError).code === "auth/requires-recent-login") {
      await logError(error, { operation: "deleteMyAccount.deleteUser (non-fatal, data already removed)", uid });
      await signOut(auth);
      return { authRemoved: false };
    }
    await logError(error, { operation: "deleteMyAccount.deleteUser", uid });
    throw error;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "That email is already registered — try signing in instead.",
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found": "No account found with that email.",
  "auth/wrong-password": "Incorrect password. Try again.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Please allow popups and try again.",
  "auth/network-request-failed": "Network error — check your connection and try again.",
  "auth/account-exists-with-different-credential":
    "An account already exists with this email using a different sign-in method.",
  "auth/requires-recent-login":
    "For security, please sign in again before doing this — then retry.",
};

/** Maps a Firebase Auth error to a friendly, user-facing message. */
export function friendlyError(error: unknown): string {
  const code = (error as AuthError | undefined)?.code ?? "";
  return ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}
