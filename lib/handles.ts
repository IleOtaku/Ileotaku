import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "./errorLogger";

const HANDLES = "handles";
const USERS = "users";

/** 3-20 characters, letters/numbers/underscore only — same shape as most platforms' handle
 * format. Checked against the lowercased value so casing never affects validity. */
const HANDLE_FORMAT = /^[a-z0-9_]{3,20}$/;

export function isValidHandleFormat(handle: string): boolean {
  return HANDLE_FORMAT.test(handle.trim().toLowerCase());
}

/** The reservation collection is keyed by the LOWERCASED handle — see HandleReservation's own
 * doc comment for why (so "EliteReader"/"elitereader" can't both be claimed). */
function handleDocId(handle: string): string {
  return handle.trim().toLowerCase();
}

export class HandleTakenError extends Error {
  constructor() {
    super("Handle taken");
    this.name = "HandleTakenError";
  }
}

export interface HandleAvailability {
  available: boolean;
  reason?: "invalid" | "taken";
}

/**
 * One-shot read behind the live "is this available" indicator as the user types. This is a
 * best-effort HINT, not the authoritative check — a check-then-claim gap always exists no matter
 * how fast this read is, which is exactly why claimHandle()'s transaction (not this function) is
 * what actually enforces uniqueness. Treats `currentUid`'s own existing handle as available, so
 * re-typing (or barely editing the casing of) your current handle never flashes a false "taken".
 */
export async function checkHandleAvailability(handle: string, currentUid?: string): Promise<HandleAvailability> {
  const trimmed = handle.trim();
  if (!isValidHandleFormat(trimmed)) return { available: false, reason: "invalid" };
  try {
    const snap = await getDoc(doc(db, HANDLES, handleDocId(trimmed)));
    if (!snap.exists()) return { available: true };
    const ownerUid = snap.data().uid as string | undefined;
    return ownerUid === currentUid ? { available: true } : { available: false, reason: "taken" };
  } catch (error) {
    await logError(error, { operation: "handles.checkHandleAvailability", handle: trimmed });
    // Fail open: never block someone from attempting to save just because this best-effort read
    // hiccuped — claimHandle()'s transaction still enforces the real guarantee on save.
    return { available: true };
  }
}

/**
 * Atomically reserves `newHandle` for `uid`, releasing `oldHandle` (if given and actually
 * different) in the very same Firestore transaction — and updates users/{uid}.handle/handleLower
 * alongside both, so a handle change can never leave the reservation collection and the profile
 * document out of step with each other, even if the app crashes mid-write.
 *
 * This is what actually makes a handle unique, not checkHandleAvailability(): the transaction
 * reads handles/{newHandleLower} first, and if it already exists (owned by someone else — or by
 * anyone at all, since an unchanged handle never reaches this branch), throws HandleTakenError
 * before writing anything. Two users racing to claim the same handle at the same instant can
 * never both win — whichever transaction's write commits first makes the loser's own read of
 * handles/{newHandleLower} see the just-created reservation and abort with nothing written.
 *
 * firestore.rules independently enforces the identical rule server-side (a handle reservation can
 * only be created fresh or updated/deleted by its own owner, and users/{uid}'s own handle field
 * can't change at all unless a matching reservation already exists) — this function alone is a
 * client-side convenience, not the actual security boundary.
 */
export async function claimHandle(uid: string, newHandle: string, oldHandle?: string | null): Promise<void> {
  const trimmedNew = newHandle.trim();
  if (!isValidHandleFormat(trimmedNew)) {
    throw new Error("Handles must be 3-20 characters: letters, numbers, and underscores only.");
  }

  const newLower = handleDocId(trimmedNew);
  const oldLower = oldHandle ? handleDocId(oldHandle) : null;
  const unchanged = newLower === oldLower;

  try {
    await runTransaction(db, async (tx) => {
      const newRef = doc(db, HANDLES, newLower);

      // All reads must happen before any writes in a Firestore transaction — skip the read
      // entirely when nothing about the handle is actually changing (re-saving the rest of the
      // profile form with the same handle, or only its display casing... which unchanged doesn't
      // cover, but that's an intentional no-op below too).
      const newSnap = unchanged ? null : await tx.get(newRef);
      if (!unchanged && newSnap!.exists()) {
        throw new HandleTakenError();
      }

      if (!unchanged) {
        tx.set(newRef, { uid, createdAt: new Date().toISOString() });
        if (oldLower) {
          tx.delete(doc(db, HANDLES, oldLower));
        }
      }

      tx.update(doc(db, USERS, uid), {
        handle: trimmedNew,
        handleLower: newLower,
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        deletionWarningEmailSent: false,
        scheduledDeletionAt: null,
      });
    });
  } catch (error) {
    if (error instanceof HandleTakenError) throw error;
    await logError(error, { operation: "handles.claimHandle", uid, newHandle: trimmedNew, oldHandle });
    throw error;
  }
}
